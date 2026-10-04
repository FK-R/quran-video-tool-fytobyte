import fs from "node:fs/promises";
import ffmpeg from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { abs, ensureDir, outputDir, projectRel } from "@/lib/storage";

const g = globalThis as unknown as { __activeRenders?: Set<string> };
const active: Set<string> = (g.__activeRenders ??= new Set<string>());

/**
 * Pure: builds the ffmpeg filter graph.
 *  input 0 = base video, input n = overlay PNG n.
 *  Each overlay is scaled to the video size, then burned in only while t is within [start,end].
 */
export function buildFilterGraph(items: { start: number; end: number }[], width: number, height: number): string[] {
  const filters: string[] = [];
  items.forEach((_, i) => {
    const n = i + 1;
    filters.push(`[${n}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba[o${n}]`);
  });
  items.forEach((it, i) => {
    const n = i + 1;
    const src = i === 0 ? "[0:v]" : `[v${n - 1}]`;
    const out = n === items.length ? "[vout]" : `[v${n}]`;
    filters.push(
      `${src}[o${n}]overlay=x=(W-w)/2:y=(H-h)/2:eof_action=repeat:` +
        `enable='between(t,${it.start.toFixed(3)},${it.end.toFixed(3)})'${out}`,
    );
  });
  return filters;
}

const timemarkToSec = (t: string) => t.split(":").reduce((a, p) => a * 60 + Number(p), 0);

export async function startRender(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { video: true, segments: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  if (!project.video) throw new HttpError(409, "Upload a background video first");
  const usable = project.segments.filter((s) => s.startTime != null && s.endTime != null && s.overlayPath);
  if (usable.length === 0) throw new HttpError(409, "No segments with overlays and timestamps to render");

  const running = await prisma.renderJob.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (running) {
    if (active.has(running.id)) return running;
    await markStale(running.id);
  }

  const job = await prisma.renderJob.create({ data: { projectId } });
  active.add(job.id);
  // Fire-and-forget: the HTTP request returns immediately, the client polls for progress.
  void runJob(job.id)
    .catch((e) => console.error("[render] job crashed", e))
    .finally(() => active.delete(job.id));
  return job;
}

async function markStale(jobId: string) {
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: "FAILED", error: "Interrupted (server restarted)", finishedAt: new Date() },
  });
}

export async function getRenderStatus(projectId: string) {
  const job = await prisma.renderJob.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  if (job && (job.status === "QUEUED" || job.status === "RUNNING") && !active.has(job.id)) {
    await markStale(job.id);
    return prisma.renderJob.findUnique({ where: { id: job.id } });
  }
  return job;
}

async function runJob(jobId: string) {
  const fail = (error: string) =>
    prisma.renderJob.update({ where: { id: jobId }, data: { status: "FAILED", error, finishedAt: new Date() } });

  try {
    const job = await prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date(), progress: 0 },
    });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: job.projectId },
      include: { video: true, segments: { orderBy: { startTime: "asc" } } },
    });
    const video = project.video!;
    const segs = project.segments.filter((s) => s.startTime != null && s.endTime != null && s.overlayPath);

    await ensureDir(outputDir(project.id));
    const finalRel = `${projectRel(project.id)}/output/final.mp4`;
    const tmp = abs(`${projectRel(project.id)}/output/final.tmp.mp4`);

    const cmd = ffmpeg(abs(video.path));
    segs.forEach((s) => cmd.input(abs(s.overlayPath!)));
    cmd
      .complexFilter(
        buildFilterGraph(
          segs.map((s) => ({ start: s.startTime!, end: s.endTime! })),
          video.width,
          video.height,
        ),
        "vout",
      )
      .outputOptions([
        "-map 0:a?",
        "-c:v libx264",
        `-preset ${process.env.FFMPEG_PRESET ?? "veryfast"}`,
        "-crf 20",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ]);

    let lastWrite = 0;
    await new Promise<void>((resolve, reject) => {
      cmd
        .on("progress", (p: { timemark?: string }) => {
          if (!p.timemark || Date.now() - lastWrite < 1000) return;
          lastWrite = Date.now();
          const pct = Math.min(99, (timemarkToSec(p.timemark) / video.durationSec) * 100);
          void prisma.renderJob.update({ where: { id: jobId }, data: { progress: pct } }).catch(() => {});
        })
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .save(tmp);
    });

    await fs.rename(tmp, abs(finalRel));
    await prisma.$transaction([
      prisma.renderJob.update({
        where: { id: jobId },
        data: { status: "SUCCEEDED", progress: 100, outputPath: finalRel, finishedAt: new Date() },
      }),
      prisma.project.update({ where: { id: project.id }, data: { status: "RENDERED" } }),
    ]);
  } catch (e) {
    await fail(((e as Error).message ?? "Render failed").slice(0, 1000));
  }
}
