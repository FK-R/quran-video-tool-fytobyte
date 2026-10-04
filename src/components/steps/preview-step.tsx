"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, Play, Save, Wand2 } from "lucide-react";
import { api, errorLines, jsonBody } from "@/lib/api-client";
import { formatTimestamp, parseTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StepProps } from "./types";

interface Draft {
  start: string;
  end: string;
}

const tryParse = (v: string): number | null => {
  if (!v.trim()) return null;
  try {
    return parseTimestamp(v);
  } catch {
    return null;
  }
};
const ms = (n: number | null) => (n == null ? null : Math.round(n * 1000));

export function PreviewStep({ project, reload, goTo }: StepProps) {
  const video = project.video!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const rowEls = useRef<Record<string, HTMLDivElement | null>>({});

  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<"save" | "auto" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // (Re)seed editable drafts from server data
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        project.segments.map((s) => [
          s.id,
          {
            start: s.startTime != null ? formatTimestamp(s.startTime) : "",
            end: s.endTime != null ? formatTimestamp(s.endTime) : "",
          },
        ]),
      ),
    );
  }, [project.segments]);

  // Parsed + validated view of the drafts
  const rows = useMemo(
    () =>
      project.segments.map((seg) => {
        const d = drafts[seg.id] ?? { start: "", end: "" };
        const start = tryParse(d.start);
        const end = tryParse(d.end);
        const bad =
          (d.start.trim() !== "" && start === null) ||
          (d.end.trim() !== "" && end === null) ||
          (start === null) !== (end === null) ||
          (start !== null && end !== null && end <= start);
        const dirty = ms(start) !== ms(seg.startTime) || ms(end) !== ms(seg.endTime);
        return { seg, d, start, end, bad, dirty };
      }),
    [project.segments, drafts],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const anyBad = rows.some((r) => r.bad);
  const anyDirty = rows.some((r) => r.dirty);
  const untimed = rows.filter((r) => r.start === null || r.end === null).length;

  /** Core sync: runs on every video frame while playing. Touches React state only when the active card changes. */
  const sync = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    const hit = rowsRef.current.find((r) => !r.bad && r.start !== null && r.end !== null && t >= r.start && t <= r.end);
    const id = hit?.seg.id ?? null;
    setActiveId((prev) => (prev === id ? prev : id));
    if (playheadRef.current) playheadRef.current.style.left = `${Math.min(100, (t / video.durationSec) * 100)}%`;
    if (clockRef.current) clockRef.current.textContent = formatTimestamp(t);
  }, [video.durationSec]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const loop = () => {
      sync();
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onStop = () => {
      cancelAnimationFrame(raf);
      sync();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("seeked", onStop);
    v.addEventListener("timeupdate", sync);
    v.addEventListener("loadedmetadata", sync);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("seeked", onStop);
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("loadedmetadata", sync);
    };
  }, [sync]);

  useEffect(sync, [rows, sync]); // re-evaluate immediately after the user edits a time

  // Preload all overlay PNGs so cards appear instantly (no flicker)
  useEffect(() => {
    project.segments.forEach((s) => {
      if (s.hasOverlay) new Image().src = `/api/projects/${project.id}/overlays/${s.id}?v=${s.overlayVersion}`;
    });
  }, [project.id, project.segments]);

  // Keep the active row visible while playing
  useEffect(() => {
    if (activeId && !videoRef.current?.paused) rowEls.current[activeId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const active = project.segments.find((s) => s.id === activeId);

  const seek = (t: number | null) => {
    if (t === null || !videoRef.current) return;
    videoRef.current.currentTime = t;
  };
  const edit = (id: string, key: keyof Draft, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  const useNow = (id: string, key: keyof Draft) => {
    if (videoRef.current) edit(id, key, formatTimestamp(videoRef.current.currentTime));
  };

  async function save() {
    setMessage(null);
    const payload = rows
      .filter((r) => r.dirty && !r.bad && r.start !== null && r.end !== null)
      .map((r) => ({ id: r.seg.id, startTime: r.start!, endTime: r.end! }));
    if (!payload.length) return;
    setBusy("save");
    try {
      await api(`/api/projects/${project.id}/segments`, jsonBody("PATCH", { segments: payload }));
      await reload();
      setMessage({ ok: true, text: `Saved ${payload.length} segment(s).` });
    } catch (e) {
      setMessage({ ok: false, text: errorLines(e).join(" · ") });
    } finally {
      setBusy(null);
    }
  }

  async function autoDistribute(overwrite: boolean) {
    if (overwrite && !confirm("Re-estimate ALL timestamps from the audio and word counts? Manual edits will be lost.")) return;
    setBusy("auto");
    setMessage(null);
    try {
      const r = await api<{ updated: number }>(`/api/projects/${project.id}/segments/auto-timing`, jsonBody("POST", { overwrite }));
      await reload();
      setMessage({ ok: true, text: `Estimated timestamps for ${r.updated} segment(s).` });
    } catch (e) {
      setMessage({ ok: false, text: errorLines(e).join(" · ") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* ---------- Player + timeline ---------- */}
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Step 3 · Sync preview</CardTitle>
          <CardDescription>Play the video — the overlay card appears whenever the playhead is inside a segment&apos;s start–end window.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${video.width} / ${video.height}` }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} src={`/api/projects/${project.id}/video/stream`} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full" />
            {active?.hasOverlay && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={active.id}
                src={`/api/projects/${project.id}/overlays/${active.id}?v=${active.overlayVersion}`}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Current: <span ref={clockRef} className="font-mono">00:00:00.000</span></span>
            <span>{active ? `Showing ayah ${active.ayah} · seg ${active.segment}` : "No overlay at this time"}</span>
            <span>Total: <span className="font-mono">{formatTimestamp(video.durationSec)}</span></span>
          </div>

          {/* Timeline: one block per segment, click to seek */}
          <div className="relative h-9 overflow-hidden rounded-md bg-muted">
            {rows.map(({ seg, start, end, bad }) =>
              start !== null && end !== null && end > start ? (
                <button
                  key={seg.id}
                  title={`Ayah ${seg.ayah}·${seg.segment}  ${formatTimestamp(start)} → ${formatTimestamp(end)}`}
                  onClick={() => seek(start)}
                  className={cn(
                    "absolute top-1 h-7 rounded-sm border text-[10px] font-medium leading-7 transition-colors",
                    bad ? "border-destructive bg-destructive/30" : seg.id === activeId ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-primary/20 hover:bg-primary/40",
                  )}
                  style={{ left: `${(start / video.durationSec) * 100}%`, width: `${Math.max(0.4, ((end - start) / video.durationSec) * 100)}%` }}
                >
                  <span className="px-1">{seg.ayah}.{seg.segment}</span>
                </button>
              ) : null,
            )}
            <div ref={playheadRef} className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500" style={{ left: 0 }} />
          </div>
        </CardContent>
      </Card>

      {/* ---------- Segment editor ---------- */}
      <Card className="flex max-h-[calc(100vh-3rem)] flex-col self-start lg:sticky lg:top-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Segments ({rows.length})</CardTitle>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={!anyDirty || anyBad || busy !== null}>
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save changes
            </Button>
            <Button size="sm" variant="outline" onClick={() => autoDistribute(untimed > 0 ? false : true)} disabled={busy !== null}>
              {busy === "auto" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {untimed > 0 ? `Auto-time ${untimed} missing` : "Re-estimate all"}
            </Button>
          </div>
          {message && <Alert variant={message.ok ? "success" : "destructive"} className="mt-2 py-2">{message.text}</Alert>}
          {anyBad && <p className="text-xs text-destructive">Fix highlighted rows (format HH:MM:SS.mmm, end after start).</p>}
        </CardHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-3">
          {rows.map(({ seg, d, bad }) => (
            <div
              key={seg.id}
              ref={(el) => {
                rowEls.current[seg.id] = el;
              }}
              className={cn("space-y-2 rounded-md border p-3", seg.id === activeId && "border-primary bg-primary/5", bad && "border-destructive")}
            >
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Ayah {seg.ayah} · Seg {seg.segment}</Badge>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => seek(tryParse(d.start))} disabled={tryParse(d.start) === null}>
                  <Play className="h-3.5 w-3.5" /> Seek
                </Button>
              </div>
              <p dir="rtl" lang="ar" className="line-clamp-1 text-lg leading-loose">{seg.arabic}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["start", "end"] as const).map((key) => (
                  <div key={key} className="flex items-center gap-1">
                    <Input
                      value={d[key]}
                      onChange={(e) => edit(seg.id, key, e.target.value)}
                      placeholder={key === "start" ? "start" : "end"}
                      aria-label={`${key} time`}
                      className={cn("h-8 px-2 font-mono text-xs", bad && "border-destructive")}
                    />
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" title="Use current video time" onClick={() => useNow(seg.id, key)}>
                      <Crosshair className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button variant="secondary" onClick={() => goTo(2)}>← Back</Button>
          <Button className="flex-1" disabled={anyDirty || anyBad || untimed > 0} onClick={() => goTo(4)}>
            {anyDirty ? "Save first" : untimed > 0 ? "Some segments have no time" : "Continue to render →"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
