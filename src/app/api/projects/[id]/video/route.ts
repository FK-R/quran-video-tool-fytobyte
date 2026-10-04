import { handle, HttpError, type IdCtx } from "@/lib/http";
import { requireProject } from "@/server/services/project.service";
import { ingestVideo } from "@/server/services/video.service";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Raw-body upload (not multipart) so large videos stream to disk without being buffered in RAM. */
export const POST = handle(async (req, { params }: IdCtx) => {
  await requireProject(params.id);
  if (!req.body) throw new HttpError(400, "Empty request body");
  const name = decodeURIComponent(req.headers.get("x-filename") ?? "video.mp4");
  const asset = await ingestVideo(params.id, name, req.body);
  return Response.json({ ...asset, path: undefined });
});
