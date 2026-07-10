import * as React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: number; label?: string };
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "danger" | "success";
  className?: string;
  /**
   * Si se define, TODA la tarjeta se vuelve un enlace navegable al detalle
   * correspondiente (accesible por teclado — Enter navega — con foco visible y
   * hover suave). Sin `href` la tarjeta se renderiza como antes (div estático).
   */
  href?: string;
  /**
   * Etiqueta accesible del enlace. Por defecto: "<label>: <value>". Úsala para
   * describir la acción, p.ej. "Ver ventas de hoy".
   */
  ariaLabel?: string;
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
  href,
  ariaLabel,
}: StatCardProps) {
  const positive = delta && delta.value >= 0;
  const interactive = Boolean(href);

  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider opacity-50">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 opacity-40" aria-hidden />}
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
      {interactive && (
        // Flecha discreta: pista visual de que la tarjeta lleva al detalle.
        <ArrowUpRight
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-[color:var(--brand-accent)] opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-focus-visible:opacity-70"
        />
      )}
    </>
  );

  const baseClass = cn(
    "relative rounded-2xl border border-black/5 p-5 shadow-sm",
    tones[tone],
    className,
  );

  if (interactive) {
    return (
      <Link
        href={href!}
        aria-label={ariaLabel ?? `${label}: ${value}`}
        className={cn(
          baseClass,
          // Toda la tarjeta es el target táctil/clic; hover suave + foco visible.
          "group block cursor-pointer no-underline transition duration-150",
          "hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)]/40 hover:shadow-md",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2",
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={baseClass}>{body}</div>;
}
