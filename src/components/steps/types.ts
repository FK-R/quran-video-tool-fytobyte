import type { ProjectDTO } from "@/lib/types";

export type Step = 1 | 2 | 3 | 4;

export interface StepProps {
  project: ProjectDTO;
  reload: () => Promise<ProjectDTO>;
  goTo: (step: Step) => void;
}
