import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Step } from "./steps/types";

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "CSV & overlays" },
  { n: 2, label: "Background video" },
  { n: 3, label: "Sync preview" },
  { n: 4, label: "Render & export" },
];

export function Stepper({ current, maxUnlocked, onSelect }: { current: Step; maxUnlocked: Step; onSelect: (s: Step) => void }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map(({ n, label }) => {
        const locked = n > maxUnlocked;
        const done = n < maxUnlocked && n !== current;
        return (
          <li key={n}>
            <button
              disabled={locked}
              onClick={() => onSelect(n)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors",
                n === current && "border-primary ring-1 ring-primary",
                locked && "cursor-not-allowed opacity-50",
                !locked && n !== current && "hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  n === current || done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {done && n !== current ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className="font-medium leading-tight">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
