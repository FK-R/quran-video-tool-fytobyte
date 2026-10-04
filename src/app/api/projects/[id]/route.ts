import { prisma } from "@/lib/prisma";
import { handle, type IdCtx } from "@/lib/http";
import { getProjectDetail, requireProject } from "@/server/services/project.service";
import { projectDir, removePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req, { params }: IdCtx) => {
  return Response.json(await getProjectDetail(params.id));
});

export const DELETE = handle(async (_req, { params }: IdCtx) => {
  await requireProject(params.id);
  await prisma.project.delete({ where: { id: params.id } }); // cascades to segments/video/jobs
  await removePath(projectDir(params.id));
  return Response.json({ ok: true });
});
