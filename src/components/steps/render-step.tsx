"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Download, Loader2 } from "lucide-react";
import { api, errorLines } from "@/lib/api-client";
import type { RenderJobDTO } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { StepProps } from "./types";

export function RenderStep({ project, reload, goTo }: StepProps) {
  const [job, setJob] = useState<RenderJobDTO | null>(project.renderJob);
  const [error, setError] = useState<string | null>(null);

  const inFlight = job?.status === "QUEUED" || job?.status === "RUNNING";
  const timed = project.segments.filter((s) => s.startTime != null && s.endTime != null).length;
  const ready = timed > 0 && project.segments.every((s) => s.hasOverlay);

  // Live progress via polling (1 Hz) while a job is running
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(async () => {
      try {
        const j = await api<RenderJobDTO | null>(`/api/projects/${project.id}/render`);
        setJob(j);
        if (j && j.status !== "QUEUED" && j.status !== "RUNNING") await reload();
      } catch (e) {
        setError(errorLines(e)[0]);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [inFlight, project.id, reload]);

  async function start() {
    setError(null);
    try {
      setJob(await api<RenderJobDTO>(`/api/projects/${project.id}/render`, { method: "POST" }));
    } catch (e) {
      setError(errorLines(e)[0]);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clapperboard className="h-5 w-5" /> Step 4 · Render &amp; export</CardTitle>
        <CardDescription>
          Burns {timed} overlay card(s) into the {project.video?.width}×{project.video?.height} video with FFmpeg (H.264 + AAC).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready && <Alert variant="destructive">Every segment needs an overlay and timestamps before rendering. Go back to fix this.</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}

        {inFlight && (
          <div className="space-y-1.5">
            <Progress value={job?.progress ?? 0} />
            <p className="text-sm text-muted-foreground">
              {job?.status === "QUEUED" ? "Queued…" : `Rendering… ${Math.round(job?.progress ?? 0)}%`}
            </p>
          </div>
        )}
        {job?.status === "FAILED" && (
          <Alert variant="destructive">
            <p className="font-medium">Render failed</p>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{job.error}</pre>
          </Alert>
        )}
        {job?.status === "SUCCEEDED" && <Alert variant="success">Your video is ready. Changing timings or overlays will require a new render.</Alert>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button variant="secondary" onClick={() => goTo(3)} disabled={inFlight}>← Back to preview</Button>
        <Button onClick={start} disabled={!ready || inFlight}>
          {inFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          {job?.status === "SUCCEEDED" ? "Render again" : "Render final video"}
        </Button>
        {job?.status === "SUCCEEDED" && job.hasOutput && (
          <a href={`/api/projects/${project.id}/download`} className={cn(buttonVariants({ variant: "default" }), "bg-emerald-700 hover:bg-emerald-800")}>
            <Download className="h-4 w-4" /> Download MP4
          </a>
        )}
      </CardFooter>
    </Card>
  );
}
