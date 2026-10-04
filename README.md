# Quran Video Studio

Full-stack tool for producing Quran videos: **CSV → transparent overlay cards → live synced preview → burned-in MP4**.

Next.js 14 (App Router, TypeScript, Tailwind + shadcn/ui) · Route Handlers · PostgreSQL + Prisma · FFmpeg · Docker

---

## 1. Features

| Step | What happens |
|------|--------------|
| 1. CSV + overlays | Upload `ayah, segment, arabic, translation, start_time, end_time`. Rows are validated (line-numbered errors) and stored. **Generate overlays** renders one transparent **1920×1080 PNG** per row (Arabic RTL with correct letter-joining + word wrap, translation LTR beneath). File paths are linked to each `Segment` row. UI auto-advances to step 2. |
| 2. Video | Streamed upload with progress bar. `ffprobe` extracts duration / resolution / fps / audio / codec → `VideoAsset` row. |
| 3. Preview | HTML5 player. Overlay card is shown when `start ≤ currentTime ≤ end` (rAF-synced). Clickable timeline + segment list; edit start/end by typing or with the "use current time" button; save in bulk. |
| 4. Render | Background FFmpeg job, **live progress (1 Hz polling)**, direct **MP4 download**. |
| Bonus A | **Auto timestamps**: if `start_time/end_time` are empty, `silencedetect` finds where speech starts/ends in the audio, and that span is divided between segments **proportionally to word count**. Also available as a button ("Auto-time missing" / "Re-estimate all"). |
| Bonus B | **Real-time render progress** (job table + polling endpoint). |

## 2. Quick start (Docker – recommended)

```bash
git clone <your-repo-url> quran-video-tool && cd quran-video-tool
docker compose up --build
# open http://localhost:3000
```
This starts Postgres 16 + the app. The container installs FFmpeg and the Amiri/Noto fonts, runs `prisma migrate deploy` automatically, and stores files in the `storage` volume.

Try it with `public/sample.csv` (has times) or `public/sample-no-times.csv` (tests auto-timing) plus any MP4 of ≥ 45 s.

## 3. Local development (without Docker for the app)

Requirements: Node 20+, FFmpeg on PATH (`ffmpeg -version`), the **Amiri** font installed on your OS (for Arabic overlays), Docker (for Postgres only).

```bash
cp .env.example .env
docker compose up -d db          # only Postgres
npm install
npx prisma migrate deploy        # or: npm run db:migrate (creates new migrations while developing)
npm run dev                      # http://localhost:3000
```
macOS: `brew install ffmpeg && brew install --cask font-amiri` · Ubuntu: `sudo apt install ffmpeg fonts-hosny-amiri fonts-noto-core`.

### Environment variables
| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | – (required) | Postgres connection string |
| `STORAGE_DIR` | `./storage` (`/data` in Docker) | Root for uploads, overlays, renders. **Must be persistent** in production |
| `MAX_UPLOAD_MB` | `1500` | Max video upload size (hard cap 2047) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | from `PATH` | Override binaries |
| `FFMPEG_PRESET` | `veryfast` | x264 preset (speed vs size) |
| `OVERLAY_CONCURRENCY` | `4` | Parallel overlay renders |
| `ARABIC_FONT` / `LATIN_FONT` | `Amiri` / `Noto Sans` | Font families used for overlays |

## 4. Architecture

```
src/
├─ app/                       # Next.js routes
│  ├─ page.tsx                # project list
│  ├─ projects/[id]/page.tsx  # 4-step workspace
│  └─ api/                    # thin Route Handlers (validation → service → JSON)
├─ components/                # UI only: steps/, ui/ (shadcn), stepper, workspace
├─ server/services/           # business logic (no HTTP): project, overlay, video, timing, render
└─ lib/                       # csv parser, time utils, prisma, storage paths, ffmpeg wrapper, http helpers
prisma/                       # schema + SQL migration
```

**Separation of concerns:** route handlers only parse/validate input and call a service; services own all logic and DB access; UI never touches storage paths. Pure functions (`parseSegmentsCsv`, `buildFilterGraph`, `distributeByWordCount`, `computeSpeechBounds`, `parseTimestamp`) are side-effect-free and unit-testable.

### Data model
```
Project 1─* Segment            (unique [projectId, ayah, segment], index [projectId, position])
Project 1─1 VideoAsset         (unique projectId)
Project 1─* RenderJob          (index [projectId, createdAt])  status QUEUED|RUNNING|SUCCEEDED|FAILED, progress 0-100
```
All children use `onDelete: Cascade`. `startTime/endTime` are nullable seconds (`Float`), which models "CSV had no times" explicitly. File paths are stored **relative** to `STORAGE_DIR`. CSV import and overlay generation run in transactions; timing edits are a single bulk PATCH transaction scoped by `projectId`.

### API
| Method & path | Purpose |
|---|---|
| `GET/POST /api/projects` | list / create |
| `GET/DELETE /api/projects/:id` | full project (segments, video, last job) / delete incl. files |
| `POST /api/projects/:id/csv` | multipart CSV → validate → replace segments |
| `POST /api/projects/:id/overlays` | generate all PNGs |
| `GET  /api/projects/:id/overlays/:segmentId` | serve PNG (immutable cache, `?v=` busting) |
| `POST /api/projects/:id/video` | raw streamed upload + ffprobe (+ auto-timing if times missing) |
| `GET  /api/projects/:id/video/stream` | video with HTTP **Range** support (seeking) |
| `PATCH /api/projects/:id/segments` | bulk time edits |
| `POST /api/projects/:id/segments/auto-timing` | `{overwrite:boolean}` |
| `POST/GET /api/projects/:id/render` | start job / poll status |
| `GET  /api/projects/:id/download` | final MP4 |
| `GET  /api/health` | liveness + DB check |

### Technology choices
- **FFmpeg via fluent-ffmpeg** over MoviePy: one language/runtime (no Python in the image), no per-frame Python compositing (MoviePy is far slower), and FFmpeg's `overlay=enable='between(t,a,b)'` does exactly "burn this PNG between these timestamps". Audio is re-encoded to AAC, video to H.264 (`yuv420p`, `+faststart`).
- **sharp (libvips + Pango)** for overlays: Pango does real Arabic shaping, bidi and wrapping. Canvas-style manual wrapping breaks Arabic joins. Font size auto-shrinks so long ayahs always fit. PNG chosen over SVG so the render needs no rasteriser and the preview shows exactly what is burned in.
- **Raw-body streamed upload** instead of multipart: large videos go straight to disk without buffering in RAM.
- **In-process job runner + `RenderJob` table + polling** instead of WebSockets/Redis: zero extra infrastructure, works on any single-container host. Stale `RUNNING` jobs (after a restart) are detected and marked failed.

### Scaling notes / known limits
- The job runner lives in the web process. For multiple replicas, move `runJob` into a worker (BullMQ/pg-boss) – the `RenderJob` table and service boundary are already in place.
- One `-i` input per overlay: fine for hundreds of segments; for very long videos (1000+ cards) split rendering into chunks and concat.
- `.mkv` may not play in every browser's preview (rendering still works).
- No authentication (single-tenant demo). Add NextAuth/Clerk before exposing publicly with real data.
- Auto-timing is an estimate (silence trimming + word-count proportion); users can fine-tune in step 3.

## 5. Deployment guide (step by step)

> **Why not Vercel?** Vercel's serverless functions have no FFmpeg, no persistent disk, short timeouts and body limits – unsuitable for video rendering. Use any host that runs Docker with a persistent volume.

### Option A – Railway (easiest)
1. Push this repo to GitHub (see §6).
2. railway.app → **New Project → Deploy from GitHub repo** → pick the repo. Railway detects the `Dockerfile`.
3. In the project: **+ New → Database → PostgreSQL**.
4. Open the app service → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `STORAGE_DIR` = `/data`
   - `MAX_UPLOAD_MB` = `500` (keep within your plan's disk)
5. App service → **Settings → Volumes → Add volume**, mount path `/data`.
6. **Settings → Networking → Generate Domain**; **Settings → Healthcheck path** = `/api/health`.
7. Deploy. Logs should show `Applying database migrations…` then `Ready`. Open the generated URL = your **Live Demo URL**.
8. Rendering is CPU/RAM hungry: use at least 2 GB RAM and set `FFMPEG_PRESET=ultrafast` on small plans.

### Option B – Render
1. **New → PostgreSQL** (copy the *Internal Database URL*).
2. **New → Web Service** → connect repo → *Runtime: Docker*.
3. Env vars: `DATABASE_URL` (internal URL), `STORAGE_DIR=/data`.
4. **Disks → Add disk**, mount path `/data` (paid instance required). Health check path `/api/health`.

### Option C – Any VPS (Hetzner, DigitalOcean, EC2) with Docker
```bash
ssh user@server
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone <repo> app && cd app
# change the Postgres password in docker-compose.yml (both places), then:
docker compose up -d --build
# HTTPS (Caddy): 
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'CADDY'
demo.yourdomain.com {
    request_body {
        max_size 2GB
    }
    reverse_proxy localhost:3000
}
CADDY
sudo systemctl reload caddy
```
Point your domain's A record to the server first. Note Cloudflare's free proxy caps uploads at 100 MB – use "DNS only" for the app subdomain.

## 6. Git / submission checklist
```bash
git init && git add -A
git commit -m "chore: scaffold Next.js, Tailwind, Prisma, Docker"
# (suggested history – commit in logical slices if you want a granular log)
# feat(db): schema + migration · feat(csv): parser · feat(overlay): sharp renderer
# feat(video): streamed upload + ffprobe · feat(preview): synced player + editor
# feat(render): ffmpeg job + progress · feat(timing): auto timestamps · docs: README
git branch -M main
git remote add origin https://github.com/<you>/quran-video-tool.git
git push -u origin main
```
Commit `package-lock.json` after your first `npm install` (the Dockerfile uses `npm ci` when it exists).
Then put the deployed URL at the top of this README.

## 7. Troubleshooting
- **Arabic shows as boxes / disconnected letters in overlays** → the font isn't installed on the host. Docker image already has it; locally install Amiri and restart.
- **`ffmpeg: not found`** → install FFmpeg or set `FFMPEG_PATH`.
- **Upload fails with 413** → raise `MAX_UPLOAD_MB` and any reverse-proxy body limit.
- **Render stuck after a redeploy** → the job is auto-marked failed on the next status poll; click *Render* again.
"# quran-video-tool-fytobyte" 
