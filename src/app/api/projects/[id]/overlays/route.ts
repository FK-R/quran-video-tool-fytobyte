import { handle, type IdCtx } from "@/lib/http";
import { generateOverlays } from "@/server/services/overlay.service";
import { requireProject } from "@/server/services/project.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handle(async (_req, { params }: IdCtx) => {
  await requireProject(params.id);
  const count = await generateOverlays(params.id);
  return Response.json({ generated: count });
});
