/** Parse "HH:MM:SS.mmm" | "MM:SS.mmm" | "SS.mmm" (comma decimals allowed) into seconds. */
export function parseTimestamp(input: string): number {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(s)) {
    throw new Error(`Invalid timestamp "${input}" (expected HH:MM:SS.mmm)`);
  }
  const [main, frac = ""] = s.split(".");
  const secs = main.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  return secs + ms / 1000;
}

/** Seconds -> "HH:MM:SS.mmm" */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}
