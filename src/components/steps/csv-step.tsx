"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, errorLines } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/time";
import { FileSpreadsheet, Loader2, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { StepProps } from "./types";

export function CsvStep({ project, reload, goTo }: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "generate" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const segments = project.segments;
  const hasRows = segments.length > 0;
  const allOverlays = hasRows && segments.every((s) => s.hasOverlay);

  async function onFile(file: File) {
    setBusy("upload");
    setErrors([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/projects/${project.id}/csv`, {
        method: "POST",
        body: fd,
      });
      await reload();
    } catch (e) {
      setErrors(errorLines(e));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function generate() {
    setBusy("generate");
    setErrors([]);
    try {
      await api(`/api/projects/${project.id}/overlays`, { method: "POST" });
      await reload();
      goTo(2); // auto-advance to Step 2
    } catch (e) {
      setErrors(errorLines(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" /> Step 1 · Upload CSV &amp;
          generate overlays
        </CardTitle>
        <CardDescription>
          Columns: <code>ayah, segment, arabic, translation</code> + optional{" "}
          <code>start_time, end_time</code> (HH:MM:SS.mmm). If the times are
          omitted they are estimated from the audio after you upload the video.{" "}
          Samples:{" "}
          <a className="underline" href="/sample.csv" download>
            with times
          </a>{" "}
          ·{" "}
          <a className="underline" href="/sample-no-times.csv" download>
            without times
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "upload" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {hasRows ? "Replace CSV" : "Choose CSV file"}
        </Button>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        {hasRows && (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Ayah</th>
                  <th className="p-2">Seg</th>
                  <th className="p-2 text-right">Arabic</th>
                  <th className="p-2">Translation</th>
                  <th className="p-2">Start</th>
                  <th className="p-2">End</th>
                  <th className="p-2">Overlay</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.id} className="border-t align-middle">
                    <td className="p-2">{s.ayah}</td>
                    <td className="p-2">{s.segment}</td>
                    <td
                      className="p-2 text-right text-lg leading-loose"
                      dir="rtl"
                      lang="ar"
                    >
                      {s.arabic}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {s.translation}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {s.startTime != null
                        ? formatTimestamp(s.startTime)
                        : "auto"}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {s.endTime != null ? formatTimestamp(s.endTime) : "auto"}
                    </td>
                    <td className="p-2">
                      {s.hasOverlay ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/projects/${project.id}/overlays/${s.id}?v=${s.overlayVersion}`}
                          alt="overlay"
                          className="h-12 w-20 rounded border bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:12px_12px] object-contain"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={generate} disabled={!hasRows || busy !== null}>
          {busy === "generate" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy === "generate"
            ? "Generating…"
            : allOverlays
              ? "Regenerate overlays"
              : "Generate overlays"}
        </Button>
        {allOverlays && (
          <Button variant="secondary" onClick={() => goTo(2)}>
            Continue →
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
