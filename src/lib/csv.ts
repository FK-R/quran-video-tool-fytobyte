import Papa from "papaparse";
import { parseTimestamp } from "./time";

export interface CsvSegment {
  ayah: number;
  segment: number;
  arabic: string;
  translation: string;
  startTime: number | null;
  endTime: number | null;
  wordCount: number;
}

export class CsvError extends Error {
  constructor(public details: string[]) {
    super("CSV validation failed");
  }
}

const REQUIRED = ["ayah", "segment", "arabic", "translation"];
const isInt = (v: string | undefined) => /^\d+$/.test((v ?? "").trim());

/**
 * Parses + validates the segment CSV.
 * start_time / end_time are OPTIONAL (bonus: auto-interpolation fills them once a video exists).
 */
export function parseSegmentsCsv(raw: string): CsvSegment[] {
  const parsed = Papa.parse<Record<string, string>>(raw.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) throw new CsvError([`Missing required column(s): ${missing.join(", ")}`]);
  if (parsed.data.length === 0) throw new CsvError(["The CSV has no data rows"]);

  const errors: string[] = [];
  const seen = new Set<string>();
  const out: CsvSegment[] = [];

  parsed.data.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const err = (msg: string) => errors.push(`Line ${line}: ${msg}`);

    if (!isInt(row.ayah)) err(`"ayah" must be a whole number`);
    if (!isInt(row.segment)) err(`"segment" must be a whole number`);
    const arabic = (row.arabic ?? "").trim();
    if (!arabic) err(`"arabic" is empty`);

    const s = (row.start_time ?? "").trim();
    const e = (row.end_time ?? "").trim();
    let startTime: number | null = null;
    let endTime: number | null = null;
    if (s || e) {
      if (!s || !e) err(`provide both start_time and end_time, or leave both empty`);
      else {
        try {
          startTime = parseTimestamp(s);
          endTime = parseTimestamp(e);
          if (endTime <= startTime) err(`end_time must be after start_time`);
        } catch (ex) {
          err((ex as Error).message);
        }
      }
    }

    const ayah = Number(row.ayah);
    const segment = Number(row.segment);
    const key = `${ayah}:${segment}`;
    if (seen.has(key)) err(`duplicate ayah/segment pair ${key}`);
    seen.add(key);

    out.push({
      ayah,
      segment,
      arabic,
      translation: (row.translation ?? "").trim(),
      startTime,
      endTime,
      wordCount: Math.max(1, arabic.split(/\s+/).filter(Boolean).length),
    });
  });

  if (errors.length) throw new CsvError(errors.slice(0, 20));
  return out.sort((a, b) => a.ayah - b.ayah || a.segment - b.segment);
}
