"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, errorLines } from "@/lib/api-client";
import type { ProjectDTO, ProjectStatus } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Stepper } from "./stepper";
import type { Step } from "./steps/types";
import { CsvStep } from "./steps/csv-step";
import { VideoStep } from "./steps/video-step";
import { PreviewStep } from "./steps/preview-step";
import { RenderStep } from "./steps/render-step";

const stepFromStatus = (s: ProjectStatus): Step =>
  s === "DRAFT" ? 1 : s === "OVERLAYS_READY" ? 2 : s === "VIDEO_READY" ? 3 : 4;

export function ProjectWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const p = await api<ProjectDTO>(`/api/projects/${id}`);
    setProject(p);
    return p;
  }, [id]);

  useEffect(() => {
    reload()
      .then((p) => setStep(stepFromStatus(p.status)))
      .catch((e) => setError(errorLines(e)[0]));
  }, [reload]);

  if (error) return <main className="mx-auto max-w-3xl p-8"><Alert variant="destructive">{error}</Alert></main>;
  if (!project)
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading project…
      </main>
    );

  const maxUnlocked: Step = project.status === "DRAFT" ? 1 : project.status === "OVERLAYS_READY" ? 2 : 4;
  const props = { project, reload, goTo: setStep };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground" aria-label="Back to projects">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-2xl font-bold tracking-tight">{project.name}</h1>
      </div>
      <Stepper current={step} maxUnlocked={maxUnlocked} onSelect={setStep} />
      {step === 1 && <CsvStep {...props} />}
      {step === 2 && <VideoStep {...props} />}
      {step === 3 && project.video && <PreviewStep {...props} />}
      {step === 4 && project.video && <RenderStep {...props} />}
    </main>
  );
}
