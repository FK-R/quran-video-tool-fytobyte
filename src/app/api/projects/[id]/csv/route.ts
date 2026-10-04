import { handle, HttpError, type IdCtx } from "@/lib/http";
import { importCsv } from "@/server/services/project.service";

export const dynamic = "force-dynamic";

export const POST = handle(async (req, { params }: IdCtx) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing CSV file (field name: file)");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "CSV is larger than 5 MB");
  const count = await importCsv(params.id, await file.text());
  return Response.json({ segments: count });
});
