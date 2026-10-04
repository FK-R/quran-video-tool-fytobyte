import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/http";
import { serveFile } from "@/lib/serve-file";
import { abs } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }: { params: { id: string; segmentId: string } }) => {
  const seg = await prisma.segment.findFirst({
    where: { id: params.segmentId, projectId: params.id },
    select: { overlayPath: true },
  });
  if (!seg?.overlayPath) throw new HttpError(404, "Overlay not generated");
  // URL carries ?v=<generatedAt>, so it is safe to cache aggressively
  return serveFile(req, abs(seg.overlayPath), "image/png", { "Cache-Control": "public, max-age=31536000, immutable" });
});
