import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, HttpError, type IdCtx } from "@/lib/http";
import { requireProject } from "@/server/services/project.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  segments: z
    .array(z.object({ id: z.string(), startTime: z.number().min(0), endTime: z.number().min(0) }))
    .min(1)
    .max(5000),
});

/** Bulk-update start/end times edited in the preview UI. */
export const PATCH = handle(async (req, { params }: IdCtx) => {
  const project = await requireProject(params.id);
  const { segments } = schema.parse(await req.json());

  const video = await prisma.videoAsset.findUnique({ where: { projectId: params.id } });
  const problems = segments
    .filter((s) => s.endTime <= s.startTime || (video && s.startTime > video.durationSec))
    .map((s) => `Segment ${s.id}: end must be after start and within the video duration`);
  if (problems.length) throw new HttpError(422, "Invalid timestamps", problems.slice(0, 10));

  await prisma.$transaction([
    // projectId in the WHERE guards against editing segments of another project
    ...segments.map((s) =>
      prisma.segment.updateMany({
        where: { id: s.id, projectId: params.id },
        data: { startTime: s.startTime, endTime: s.endTime },
      }),
    ),
    // timings changed -> any previous export is stale
    ...(project.status === "RENDERED"
      ? [prisma.project.update({ where: { id: params.id }, data: { status: "VIDEO_READY" } })]
      : []),
  ]);
  return Response.json({ updated: segments.length });
});
