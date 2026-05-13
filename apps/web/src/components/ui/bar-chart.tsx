import { cn } from "@/lib/utils/cn";

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  className?: string;
  formatter?: (value: number) => string;
}

export function BarChart({ data, className, formatter }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={cn("space-y-2", className)}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label} className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="opacity-80">{d.label}</span>
              <span className="font-medium tabular-nums">
                {formatter ? formatter(d.value) : d.value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: d.color ?? "var(--brand-primary)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Spark({ values, className }: { values: number[]; className?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const w = 200;
  const h = 40;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--brand-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
