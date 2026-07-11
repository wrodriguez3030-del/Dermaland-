"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import type { LabeledValue } from "./dashboard-metrics";

/**
 * Gráficos SVG del dashboard ejecutivo (sin dependencias).
 * Reglas aplicadas (dataviz): magnitud = un solo matiz (teal de marca);
 * categorías = paleta fija VALIDADA (CVD ΔE 57.8, contraste ≥3:1); marcas
 * finas con puntas redondeadas; texto siempre en tinta (nunca del color de la
 * serie); leyenda con etiquetas directas; tooltips nativos por marca.
 */

export const CATEGORICAL = ["#0d9488", "#d97706", "#7c3aed", "#db2777"] as const;
const ACCENT = "#0d9488";
const INK_MUTED = "rgba(11,28,48,0.45)";
const GRID = "rgba(11,28,48,0.08)";

/** Tarjeta contenedora: título + enlace "Ver detalle →" (patrón del sistema). */
export function ChartCard({
  title,
  href,
  linkLabel = "Ver detalle →",
  children,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{title}</h3>
          {href && (
            <Link href={href} className="shrink-0 text-xs font-medium text-[color:var(--brand-accent)] hover:underline">
              {linkLabel}
            </Link>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Barras verticales (magnitud, un solo matiz) con valor encima de cada barra. */
export function BarChart({
  data,
  formatValue = (n) => `RD$${compact(n)}`,
  height = 210,
}: {
  data: LabeledValue[];
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const W = 460;
  const PAD_T = 26, PAD_B = 34, PAD_X = 12;
  const plotH = height - PAD_T - PAD_B;
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = data.length;
  const slot = (W - PAD_X * 2) / Math.max(n, 1);
  const barW = Math.min(46, slot * 0.5);

  if (n === 0) {
    return <p className="py-10 text-center text-sm opacity-50">Sin datos este mes.</p>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Gráfico de barras">
      {/* rejilla horizontal discreta */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD_X} x2={W - PAD_X} y1={PAD_T + plotH * (1 - f)} y2={PAD_T + plotH * (1 - f)} stroke={GRID} strokeDasharray="3 4" />
      ))}
      {/* línea base */}
      <line x1={PAD_X} x2={W - PAD_X} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="rgba(11,28,48,0.18)" />
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * plotH, d.value > 0 ? 3 : 0);
        const x = PAD_X + slot * i + (slot - barW) / 2;
        const y = PAD_T + plotH - h;
        return (
          <g key={d.label} className="transition-opacity hover:opacity-80">
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            {/* barra con punta superior redondeada, anclada a la base */}
            <path d={`M${x},${PAD_T + plotH} L${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + barW - 4},${y} Q${x + barW},${y} ${x + barW},${y + 4} L${x + barW},${PAD_T + plotH} Z`} fill={ACCENT} />
            <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgba(11,28,48,0.75)">
              {formatValue(d.value)}
            </text>
            <text x={x + barW / 2} y={PAD_T + plotH + 16} textAnchor="middle" fontSize="9.5" fontWeight="600" letterSpacing="0.04em" fill={INK_MUTED}>
              {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Dona (composición) con total al centro y leyenda con % + valores. */
export function DonutChart({
  data,
  centerLabel = "TOTAL",
  formatValue,
}: {
  data: LabeledValue[];
  centerLabel?: string;
  formatValue: (n: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 62, STROKE = 26, C = 80;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  if (total <= 0) {
    return <p className="py-10 text-center text-sm opacity-50">Sin datos este mes.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label="Composición">
        <g transform={`rotate(-90 ${C} ${C})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * circumference;
            const el = (
              <circle
                key={d.label}
                cx={C} cy={C} r={R}
                fill="none"
                stroke={CATEGORICAL[i % CATEGORICAL.length]}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(len - 2, 0.5)} ${circumference - Math.max(len - 2, 0.5)}`}
                strokeDashoffset={-offset}
                className="transition-opacity hover:opacity-80"
              >
                <title>{`${d.label}: ${formatValue(d.value)} (${(frac * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={C} y={C - 6} textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="0.1em" fill={INK_MUTED}>
          {centerLabel}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fontSize="13" fontWeight="800" fill="rgba(11,28,48,0.9)">
          {formatValue(total)}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="font-semibold tabular-nums opacity-70">{((d.value / total) * 100).toFixed(1)}%</span>
            <span className="w-24 text-right font-semibold tabular-nums">{formatValue(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tendencia (línea 2px + área con degradado) con puntos hover. */
export function TrendChart({
  data,
  formatValue = (n) => `RD$${compact(n)}`,
  height = 210,
}: {
  data: LabeledValue[];
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const W = 460;
  const PAD_T = 18, PAD_B = 30, PAD_L = 14, PAD_R = 14;
  const plotH = height - PAD_T - PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = data.length;
  const pt = (i: number, v: number): [number, number] => [
    PAD_L + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)),
    PAD_T + plotH * (1 - v / max),
  ];
  const pts = data.map((d, i) => pt(i, d.value));
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0]},${PAD_T + plotH} L${pts[0]![0]},${PAD_T + plotH} Z`;

  if (n === 0) {
    return <p className="py-10 text-center text-sm opacity-50">Sin datos.</p>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Tendencia">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH * (1 - f)} y2={PAD_T + plotH * (1 - f)} stroke={GRID} strokeDasharray="3 4" />
      ))}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="rgba(11,28,48,0.18)" />
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const [x, y] = pts[i]!;
        return (
          <g key={d.label}>
            {/* target de hover ≥8px con tooltip nativo */}
            <circle cx={x} cy={y} r="9" fill="transparent">
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </circle>
            <circle cx={x} cy={y} r="3" fill="#fff" stroke={ACCENT} strokeWidth="2" />
            <text x={x} y={PAD_T + plotH + 16} textAnchor="middle" fontSize="9" fontWeight="600" fill={INK_MUTED}>
              {d.label.split(" ")[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
