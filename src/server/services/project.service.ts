import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { parseSegmentsCsv } from "@/lib/csv";
import { outputDir, overlayDir } from "@/lib/storage";
import { removePath } from "@/lib/storage";
import type { ProjectDTO } from "@/lib/types";
import { applyAutoTiming } from "./timing.service";

export async function requireProject(id: string) {
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "Project not found");
  return p;
}

export async function getProjectDetail(id: string): Promise<ProjectDTO> {
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      segments: { orderBy: { position: "asc" } },
      video: true,
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!p) throw new HttpError(404, "Project not found");
  const job = p.renderJobs[0];
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    segments: p.segments.map((s) => ({
      id: s.id,
      ayah: s.ayah,
      segment: s.segment,
      arabic: s.arabic,
      translation: s.translation,
      wordCount: s.wordCount,
      startTime: s.startTime,
      endTime: s.endTime,
      hasOverlay: !!s.overlayPath,
      overlayVersion: s.overlayGeneratedAt?.getTime() ?? 0,
    })),
    video: p.video && {
      originalName: p.video.originalName,
      sizeBytes: p.video.sizeBytes,
      durationSec: p.video.durationSec,
      width: p.video.width,
      height: p.video.height,
      fps: p.video.fps,
      hasAudio: p.video.hasAudio,
      videoCodec: p.video.videoCodec,
    },
    renderJob: job && {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      hasOutput: !!job.outputPath,
    },
  };
}

/** Replaces all segments of a project with the rows of an uploaded CSV (atomic). */
export async function importCsv(projectId: string, csvText: string) {
  await requireProject(projectId);
  const rows = parseSegmentsCsv(csvText);

  await prisma.$transaction([
    prisma.renderJob.deleteMany({ where: { projectId } }),
    prisma.segment.deleteMany({ where: { projectId } }),
    prisma.segment.createMany({ data: rows.map((r, position) => ({ projectId, position, ...r })) }),
    prisma.project.update({ where: { id: projectId }, data: { status: "DRAFT" } }),
  ]);
  await Promise.all([removePath(overlayDir(projectId)), removePath(outputDir(projectId))]);

  if ((await prisma.videoAsset.count({ where: { projectId } })) > 0) {
    await applyAutoTiming(projectId, { overwrite: false });
  }
  return rows.length;
}
