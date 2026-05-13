import * as React from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: number; label?: string };
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "danger" | "success";
  className?: string;
}

const tones = {
  default: "bg-white",
  primary: "bg-[color:var(--brand-primary)]/[0.08]",
  warning: "bg-amber-50",
  danger: "bg-rose-50",
  success: "bg-emerald-50",
};

export function StatCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  tone = "default",
  className,
}: StatCardProps) {
  const positive = delta && delta.value >= 0;
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/5 p-5 shadow-sm",
        tones[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider opacity-50">
          {label}
        </span>
        {Icon && (
          <Icon className="h-4 w-4 opacity-40" aria-hidden />
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {(hint || delta) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                positive ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta.value)}%
            </span>
          )}
          {hint && <span className="opacity-60">{hint}</span>}
        </div>
      )}
    </div>
  );
}
