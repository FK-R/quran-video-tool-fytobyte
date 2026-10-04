import { handle, HttpError, type IdCtx } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { serveFile, VIDEO_MIME } from "@/lib/serve-file";
import { abs } from "@/lib/storage";
import path from "node:path";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }: IdCtx) => {
  const video = await prisma.videoAsset.findUnique({
    where: { projectId: params.id },
  });
  if (!video) throw new HttpError(404, "No video uploaded");
  const type =
    VIDEO_MIME[path.extname(video.path).toLowerCase()] ??
    "application/octet-stream";
  return serveFile(req, abs(video.path), type);
});
