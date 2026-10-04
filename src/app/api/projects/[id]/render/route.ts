import type { RenderJob } from "@prisma/client";
import { handle, type IdCtx } from "@/lib/http";
import { requireProject } from "@/server/services/project.service";
import { getRenderStatus, startRender } from "@/server/services/render.service";
import type { RenderJobDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const toDto = (j: RenderJob): RenderJobDTO => ({
  id: j.id,
  status: j.status,
  progress: j.progress,
  error: j.error,
  hasOutput: !!j.outputPath,
});

export const POST = handle(async (_req, { params }: IdCtx) => {
  await requireProject(params.id);
  return Response.json(toDto(await startRender(params.id)), { status: 202 });
});

/** Polled by the UI every second while rendering. */
export const GET = handle(async (_req, { params }: IdCtx) => {
  await requireProject(params.id);
  const job = await getRenderStatus(params.id);
  return Response.json(job ? toDto(job) : null);
});
