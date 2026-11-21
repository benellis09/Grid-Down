import { cn } from "@/lib/utils";

interface StatBarProps {
  label: string;
  value: number;
  tone?: "health" | "energy" | "supplies" | "morale";
}

const toneClass: Record<string, string> = {
  health: "bg-destructive",
  energy: "bg-primary",
  supplies: "bg-foreground/70",
  morale: "bg-foreground/40",
};

export function StatBar({ label, value, tone = "health" }: StatBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const critical = clamped <= 25;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-mono-tight text-xs",
            critical ? "text-destructive" : "text-foreground/80"
          )}
        >
          {clamped}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            critical ? "bg-destructive" : toneClass[tone]
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
