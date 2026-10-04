import ffmpeg from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { abs } from "@/lib/storage";
import { HttpError } from "@/lib/http";

interface Silence {
  start: number;
  end: number | null;
}

/** Pure: derive the "speech region" from detected silences. */
export function computeSpeechBounds(silences: Silence[], duration: number) {
  let start = 0;
  let end = duration;
  const first = silences[0];
  if (first && first.start < 0.15 && first.end != null) start = first.end; // leading silence
  const last = silences[silences.length - 1];
  if (last && last.end == null) end = last.start; // trailing silence runs to EOF
  return end - start >= 1 ? { start, end } : { start: 0, end: duration };
}

/** Uses ffmpeg `silencedetect` on the audio track to find where recitation actually starts/ends. */
export function detectSpeechBounds(file: string, duration: number): Promise<{ start: number; end: number }> {
  return new Promise((resolve) => {
    const silences: Silence[] = [];
    ffmpeg(file)
      .noVideo()
      .audioFilters("silencedetect=noise=-35dB:d=0.8")
      .format("null")
      .output("-")
      .on("stderr", (line: string) => {
        const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
        if (s) silences.push({ start: Math.max(0, Number(s[1])), end: null });
        const e = /silence_end:\s*([\d.]+)/.exec(line);
        if (e && silences.length) silences[silences.length - 1].end = Number(e[1]);
      })
      .on("end", () => resolve(computeSpeechBounds(silences, duration)))
      .on("error", () => resolve({ start: 0, end: duration })) // no audio / failure -> whole video
      .run();
  });
}

/** Pure: split [start,end] across items proportionally to their word counts. */
export function distributeByWordCount(items: { id: string; weight: number }[], start: number, end: number) {
  const GAP = 0.08;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const total = items.reduce((a, i) => a + Math.max(1, i.weight), 0);
  const span = end - start;
  let cursor = start;
  return items.map((i) => {
    const d = (span * Math.max(1, i.weight)) / total;
    const s = cursor;
    cursor += d;
    return { id: i.id, start: round3(s), end: round3(Math.max(s + 0.2, cursor - GAP)) };
  });
}

/**
 * BONUS: automatic timestamp interpolation.
 * overwrite=false -> only segments with missing times; overwrite=true -> all segments.
 */
export async function applyAutoTiming(projectId: string, opts: { overwrite: boolean }) {
  const video = await prisma.videoAsset.findUnique({ where: { projectId } });
  if (!video) throw new HttpError(409, "Upload a video first");

  const segments = await prisma.segment.findMany({ where: { projectId }, orderBy: { position: "asc" } });
  const targets = segments.filter((s) => opts.overwrite || s.startTime == null || s.endTime == null);
  if (targets.length === 0) return 0;

  const { start, end } = await detectSpeechBounds(abs(video.path), video.durationSec);
  const plan = distributeByWordCount(
    targets.map((t) => ({ id: t.id, weight: t.wordCount })),
    start,
    end,
  );
  await prisma.$transaction(
    plan.map((p) => prisma.segment.update({ where: { id: p.id }, data: { startTime: p.start, endTime: p.end } })),
  );
  return plan.length;
}
