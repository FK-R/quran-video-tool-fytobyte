import { z } from "zod";
import { handle, type IdCtx } from "@/lib/http";
import { requireProject } from "@/server/services/project.service";
import { applyAutoTiming } from "@/server/services/timing.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ overwrite: z.boolean().default(false) });

export const POST = handle(async (req, { params }: IdCtx) => {
  await requireProject(params.id);
  const body = schema.parse(await req.json().catch(() => ({})));
  const updated = await applyAutoTiming(params.id, body);
  return Response.json({ updated });
});
