import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@/lib/prisma";
import { probe } from "@/lib/ffmpeg";
import { HttpError } from "@/lib/http";
import { abs, ensureDir, outputDir, projectRel, removePath, videoDir } from "@/lib/storage";
import { applyAutoTiming } from "./timing.service";

const ALLOWED_EXT = new Set([".mp4", ".m4v", ".mov", ".webm", ".mkv"]);
const MAX_BYTES = Math.min(Number(process.env.MAX_UPLOAD_MB ?? 1500), 2047) * 1024 * 1024;

function parseFps(rate?: string): number {
  if (!rate) return 0;
  const [n, d = "1"] = rate.split("/");
  const v = Number(n) / Number(d);
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
}

/** Streams the upload straight to disk (no buffering), probes it, stores metadata in Postgres. */
export async function ingestVideo(projectId: string, originalName: string, body: ReadableStream<Uint8Array>) {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new HttpError(415, `Unsupported video type "${ext}". Use mp4, mov, webm or mkv.`);

  const dir = videoDir(projectId);
  await removePath(dir);
  await ensureDir(dir);
  const rel = `${projectRel(projectId)}/video/source${ext}`;

  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_BYTES) cb(new HttpError(413, `File exceeds ${Math.round(MAX_BYTES / 1048576)} MB limit`));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream),
      limiter,
      createWriteStream(abs(rel)),
    );
  } catch (e) {
    await removePath(dir);
    throw e;
  }

  let info;
  try {
    info = await probe(abs(rel));
  } catch {
    await removePath(dir);
    throw new HttpError(422, "Could not read this file as a video");
  }
  const v = info.streams.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) {
    await removePath(dir);
    throw new HttpError(422, "No video stream found in the uploaded file");
  }
  const data = {
    originalName,
    path: rel,
    sizeBytes: size,
    durationSec: Number(info.format.duration ?? v.duration ?? 0),
    width: v.width,
    height: v.height,
    fps: parseFps(v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate),
    hasAudio: info.streams.some((s) => s.codec_type === "audio"),
    videoCodec: v.codec_name ?? null,
  };

  // A new base video invalidates earlier renders.
  await removePath(outputDir(projectId));
  const overlaysDone =
    (await prisma.segment.count({ where: { projectId } })) > 0 &&
    (await prisma.segment.count({ where: { projectId, overlayPath: null } })) === 0;
  await prisma.$transaction([
    prisma.renderJob.deleteMany({ where: { projectId } }),
    prisma.videoAsset.upsert({ where: { projectId }, create: { projectId, ...data }, update: data }),
    prisma.project.update({ where: { id: projectId }, data: { status: overlaysDone ? "VIDEO_READY" : "DRAFT" } }),
  ]);

  // BONUS: fill missing start/end times from the audio track
  const autoTimed = await applyAutoTiming(projectId, { overwrite: false });
  return { ...data, autoTimed };
}
