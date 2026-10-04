import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
