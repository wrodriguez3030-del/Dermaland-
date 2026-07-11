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

/**
 * Estilo ejecutivo (tarjeta blanca + chip de ícono + valor en color de tono):
 * el tono colorea el CHIP y el VALOR, no el fondo — mismo lenguaje visual en
 * todo el sistema.
 */
const chipTones = {
  default: "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]",
  primary: "bg-[color:var(--brand-primary)] text-white",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
  success: "bg-emerald-100 text-emerald-700",
};

const valueTones = {
  default: "text-[color:var(--brand-accent)]",
  primary: "text-[color:var(--brand-accent)]",
  warning: "text-amber-700",
  danger: "text-rose-700",
  success: "text-emerald-700",
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
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            aria-hidden
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              chipTones[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.08em] opacity-55">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-2.5 truncate text-[26px] font-extrabold leading-tight tracking-tight tabular-nums",
          valueTones[tone],
        )}
      >
        {value}
      </div>
      {(hint || delta) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                positive ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta.value)}%
              {delta.label && <span className="font-normal opacity-70"> {delta.label}</span>}
            </span>
          )}
          {hint && <span className="opacity-50">— {hint}</span>}
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
    "relative rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm",
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
