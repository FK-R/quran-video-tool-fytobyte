"use client";

import { useRef, useState } from "react";
import { Film, Loader2, Upload } from "lucide-react";
import { errorLines, uploadFile } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/time";
import { formatBytes } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { StepProps } from "./types";

export function VideoStep({ project, reload, goTo }: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const video = project.video;

  async function onFile(file: File) {
    setErrors([]);
    setNote(null);
    setPct(0);
    try {
      const res = await uploadFile<{ autoTimed: number }>(`/api/projects/${project.id}/video`, file, (p) => {
        setPct(p);
        if (p >= 100) setProcessing(true); // server is now probing + analysing audio
      });
      if (res.autoTimed > 0) setNote(`Timestamps estimated automatically for ${res.autoTimed} segment(s) from the audio track.`);
      await reload();
    } catch (e) {
      setErrors(errorLines(e));
    } finally {
      setPct(null);
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const uploading = pct !== null;
  const meta: [string, string][] = video
    ? [
        ["File", video.originalName],
        ["Size", formatBytes(video.sizeBytes)],
        ["Duration", formatTimestamp(video.durationSec)],
        ["Resolution", `${video.width}×${video.height}`],
        ["Frame rate", `${video.fps} fps`],
        ["Audio", video.hasAudio ? "yes" : "no audio track"],
        ["Codec", video.videoCodec ?? "—"],
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Film className="h-5 w-5" /> Step 2 · Background video</CardTitle>
        <CardDescription>Upload the recitation video (mp4, mov, webm, mkv). Metadata is extracted with ffprobe and saved to the project.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input ref={inputRef} type="file" accept="video/*,.mkv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {video ? "Replace video" : "Choose video file"}
        </Button>

        {uploading && (
          <div className="space-y-1.5">
            <Progress value={pct ?? 0} />
            <p className="text-xs text-muted-foreground">
              {processing ? "Analysing video & audio…" : `Uploading… ${Math.round(pct ?? 0)}%`}
            </p>
          </div>
        )}
        {errors.length > 0 && (
          <Alert variant="destructive">
            <ul className="list-disc space-y-1 pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </Alert>
        )}
        {note && <Alert variant="success">{note}</Alert>}

        {video && !uploading && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border p-4 text-sm sm:grid-cols-4">
            {meta.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="secondary" onClick={() => goTo(1)}>← Back</Button>
        <Button disabled={!video || uploading} onClick={() => goTo(3)}>Continue to preview →</Button>
      </CardFooter>
    </Card>
  );
}
