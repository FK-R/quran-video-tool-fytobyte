import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { HttpError } from "./http";

/** Streams a file with HTTP Range support (required for seeking in <video>). */
export async function serveFile(
  req: Request,
  file: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    throw new HttpError(404, "File not found");
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    ...extraHeaders,
  };
  const toWeb = (s: ReturnType<typeof createReadStream>) => Readable.toWeb(s) as unknown as ReadableStream;

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m) {
    let start = m[1] === "" ? NaN : Number(m[1]);
    let end = m[2] === "" ? size - 1 : Number(m[2]);
    if (Number.isNaN(start)) {
      start = Math.max(0, size - Number(m[2])); // suffix range: last N bytes
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(toWeb(createReadStream(file, { start, end })), { status: 206, headers });
  }
  headers["Content-Length"] = String(size);
  return new Response(toWeb(createReadStream(file)), { status: 200, headers });
}

export const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};
