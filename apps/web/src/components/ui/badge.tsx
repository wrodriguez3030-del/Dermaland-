import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  outlined?: boolean;
}

const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-[color:var(--brand-fg)]",
  primary: "bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
  purple: "bg-violet-50 text-violet-700",
};

const outlinedTones: Record<Tone, string> = {
  neutral: "border border-black/15 text-[color:var(--brand-fg)]",
  primary: "border border-[color:var(--brand-primary)]/30 text-[color:var(--brand-accent)]",
  success: "border border-emerald-200 text-emerald-700",
  warning: "border border-amber-200 text-amber-700",
  danger: "border border-rose-200 text-rose-700",
  info: "border border-sky-200 text-sky-700",
  purple: "border border-violet-200 text-violet-700",
};

export function Badge({
  className,
  tone = "neutral",
  outlined = false,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        outlined ? outlinedTones[tone] : tones[tone],
        className,
      )}
      {...props}
    />
  );
}
