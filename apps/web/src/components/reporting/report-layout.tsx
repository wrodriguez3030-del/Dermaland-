"use client";

import * as React from "react";
import { Printer, FileText } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Base reusable para una reportería con formato ejecutivo profesional.
// Apto para pantalla, impresión y exportación a PDF (vía window.print() + el
// bloque `@media print` con página A4 de globals.css). Presentación pura: no
// toca datos, DGII ni secuencias.

// ─── Layout ──────────────────────────────────────────────────────────────────

/** Contenedor del informe; marca el área imprimible (página A4 al imprimir). */
export function ReportLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("report-print-area space-y-5", className)}>{children}</div>
  );
}

/** Botón "Imprimir / Guardar PDF" (oculto al imprimir). */
export function PrintReportButton({
  label = "Imprimir / PDF",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "no-print inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium transition hover:border-[color:var(--brand-accent)] hover:text-[color:var(--brand-accent)]",
        className,
      )}
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}

// ─── Encabezado ──────────────────────────────────────────────────────────────

export interface ReportHeaderProps {
  businessName: string;
  title: string;
  subtitle?: string;
  generatedBy?: string;
  generatedAt: string;
  /** Texto del logo (iniciales) si no hay imagen. */
  logoText?: string;
  logoUrl?: string;
}

export function ReportHeader({
  businessName,
  title,
  subtitle,
  generatedBy,
  generatedAt,
  logoText,
  logoUrl,
}: ReportHeaderProps) {
  const initials =
    logoText ??
    businessName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return (
    <div className="report-header flex flex-col gap-4 rounded-2xl border border-black/10 bg-white p-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={businessName}
            className="h-14 w-14 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/[0.12] text-lg font-semibold text-[color:var(--brand-primary)]">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-[color:var(--brand-primary)]">
            {businessName}
          </p>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 max-w-xl text-sm opacity-60">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-sm sm:text-right">
        <p className="font-medium">Generado</p>
        <p className="opacity-70">{generatedAt}</p>
        {generatedBy && (
          <p className="mt-1 opacity-70">
            Por <span className="font-medium opacity-100">{generatedBy}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export type ReportTone = "default" | "primary" | "success" | "warning" | "danger";

/**
 * Estilo ejecutivo (mismo lenguaje que StatCard): tarjeta blanca y el TONO
 * colorea el VALOR, no el fondo.
 */
const KPI_TONE: Record<ReportTone, string> = {
  default: "text-[color:var(--brand-fg)]",
  primary: "text-[color:var(--brand-accent)]",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
};

export interface ReportKpi {
  label: string;
  value: string | number;
  hint?: string;
  tone?: ReportTone;
}

/** Tarjetas de KPIs limpias: número grande + etiqueta en mayúsculas. */
export function ReportSummaryCards({
  items,
  columns = 5,
}: {
  items: ReportKpi[];
  columns?: 3 | 4 | 5;
}) {
  const cols =
    columns === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-5";
  return (
    <div className={cn("grid gap-3", cols)}>
      {items.map((k, i) => (
        <div
          key={`${k.label}-${i}`}
          className="rounded-xl border border-black/[0.07] bg-white p-4 shadow-sm"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-55">
            {k.label}
          </p>
          <p
            className={cn(
              "mt-1.5 text-2xl font-extrabold tabular-nums leading-tight tracking-tight",
              KPI_TONE[k.tone ?? "default"],
            )}
          >
            {k.value}
          </p>
          {k.hint && <p className="mt-1 text-xs opacity-50">— {k.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Sección ─────────────────────────────────────────────────────────────────

const SECTION_TONE: Record<ReportTone, string> = {
  default: "text-[color:var(--brand-primary)]",
  primary: "text-[color:var(--brand-primary)]",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
};

const SECTION_BAR: Record<ReportTone, string> = {
  default: "bg-[color:var(--brand-primary)]",
  primary: "bg-[color:var(--brand-primary)]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

export interface ReportSectionProps {
  title: string;
  subtitle?: string;
  tone?: ReportTone;
  actions?: React.ReactNode;
  /** Sin padding interno (para tablas que llegan al borde). */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Bloque de contenido con encabezado de sección corporativo. */
export function ReportSection({
  title,
  subtitle,
  tone = "default",
  actions,
  flush = false,
  children,
  className,
}: ReportSectionProps) {
  return (
    <section
      className={cn(
        "report-section overflow-hidden rounded-2xl border border-black/10 bg-white",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("h-4 w-1 rounded-full", SECTION_BAR[tone])} />
          <div>
            <h2 className={cn("text-sm font-semibold uppercase tracking-wide", SECTION_TONE[tone])}>
              {title}
            </h2>
            {subtitle && <p className="text-xs opacity-55">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

// ─── Resumen de filtros ──────────────────────────────────────────────────────

export interface ReportFilterChip {
  label: string;
  value: string;
}

/** Bloque "Filtros: A = x | B = y" o "Sin filtros aplicados". */
export function ReportFiltersSummary({ filters }: { filters: ReportFilterChip[] }) {
  return (
    <div className="report-filters flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-black/15 bg-black/[0.015] px-4 py-2.5 text-sm">
      <FileText className="h-4 w-4 opacity-50" />
      {filters.length === 0 ? (
        <span className="opacity-60">Sin filtros aplicados</span>
      ) : (
        <>
          <span className="font-medium opacity-70">Filtros:</span>
          {filters.map((f, i) => (
            <React.Fragment key={`${f.label}-${i}`}>
              {i > 0 && <span className="opacity-30">|</span>}
              <span className="opacity-80">
                <span className="opacity-60">{f.label} =</span>{" "}
                <span className="font-medium">{f.value}</span>
              </span>
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

export function ReportFooter({
  businessName,
  reportName,
  generatedAt,
}: {
  businessName: string;
  reportName: string;
  generatedAt: string;
}) {
  return (
    <footer className="report-footer mt-2 flex flex-col gap-1 border-t border-black/10 pt-3 text-xs opacity-55 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium">{businessName}</span>
      <span>{reportName}</span>
      <span>Generado el {generatedAt}</span>
    </footer>
  );
}

// ─── Estado vacío ────────────────────────────────────────────────────────────

export function ReportEmptyState({
  message = "No hay datos para los filtros seleccionados.",
  icon: Icon = FileText,
}: {
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icon className="h-7 w-7 opacity-30" />
      <p className="text-sm opacity-60">{message}</p>
    </div>
  );
}

// ─── Badge por prioridad/estado ──────────────────────────────────────────────

export type ReportBadgeTone =
  | "high"
  | "medium"
  | "low"
  | "success"
  | "pending"
  | "neutral";

const BADGE_TONE: Record<ReportBadgeTone, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-emerald-100 text-emerald-700",
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  neutral: "bg-black/[0.06] text-black/60",
};

export function ReportBadge({
  tone = "neutral",
  children,
}: {
  tone?: ReportBadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
