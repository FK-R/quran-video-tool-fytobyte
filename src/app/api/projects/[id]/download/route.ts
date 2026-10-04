import { prisma } from "@/lib/prisma";
import { handle, HttpError, type IdCtx } from "@/lib/http";
import { serveFile } from "@/lib/serve-file";
import { abs } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }: IdCtx) => {
  const [project, job] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { name: true } }),
    prisma.renderJob.findFirst({
      where: { projectId: params.id, status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!project || !job?.outputPath) throw new HttpError(404, "No rendered video available yet");
  const safe = project.name.replace(/[^\w\-]+/g, "_").slice(0, 60) || "quran-video";
  return serveFile(req, abs(job.outputPath), "video/mp4", {
    "Content-Disposition": `attachment; filename="${safe}.mp4"`,
  });
});
