import * as React from "react";

/** Encabezado de página de Súper Admin (tema violeta). */
export function SAHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-violet-300">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SAStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "danger" | "success" | "warning";
}) {
  const border =
    tone === "danger"
      ? "border-rose-500/40 bg-rose-500/10"
      : tone === "success"
        ? "border-emerald-500/40 bg-emerald-500/10"
        : tone === "warning"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-violet-800 bg-violet-900/40";
  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <span className="text-xs uppercase tracking-wider text-violet-300">{label}</span>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-violet-300">{hint}</div>}
    </div>
  );
}

export function SACard({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-violet-800 bg-violet-900/40 p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Envuelve una tabla con el estilo violeta del panel. */
export function SATable({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-violet-800">
      <table className="w-full text-sm">
        <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
          {head}
        </thead>
        <tbody className="divide-y divide-violet-800">{children}</tbody>
      </table>
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-300",
  danger: "bg-rose-500/20 text-rose-300",
  warning: "bg-amber-500/20 text-amber-300",
  info: "bg-violet-500/20 text-violet-200",
  neutral: "bg-white/10 text-violet-200",
};

export function SABadge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASS[tone]}`}>{children}</span>
  );
}

export function SAEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-700 bg-violet-900/30 p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 text-xs text-violet-300">{description}</p>}
    </div>
  );
}
