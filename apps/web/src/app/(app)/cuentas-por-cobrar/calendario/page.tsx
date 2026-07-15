"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { agingBucket, todayRD, type AgingBucket } from "@/features/receivables/aging";
import { usePendingReceivables } from "@/features/receivables/components";
import { money } from "@/features/receivables/receivables-client";

const DOT: Record<AgingBucket, string> = {
  al_dia: "bg-emerald-500",
  por_vencer: "bg-amber-500",
  v1_30: "bg-orange-500",
  v31_60: "bg-red-600",
  v60: "bg-red-900",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/** Calendario mensual de vencimientos con colores según estado. */
export default function CalendarioPage() {
  const { rows, error, loading } = usePendingReceivables();
  const hoy = todayRD();
  const [ym, setYm] = React.useState(hoy.slice(0, 7)); // YYYY-MM

  const [year, month] = ym.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startCol = (first.getUTCDay() + 6) % 7; // lunes = 0

  const byDay = new Map<string, { count: number; amount: number; worst: AgingBucket }>();
  for (const r of rows ?? []) {
    if (!r.dueDate || !r.dueDate.startsWith(ym)) continue;
    const cur = byDay.get(r.dueDate) ?? { count: 0, amount: 0, worst: "al_dia" as AgingBucket };
    cur.count += 1;
    cur.amount = Math.round((cur.amount + r.balance) * 100) / 100;
    const b = agingBucket(r.dueDate, hoy);
    const order: AgingBucket[] = ["al_dia", "por_vencer", "v1_30", "v31_60", "v60"];
    if (order.indexOf(b) > order.indexOf(cur.worst)) cur.worst = b;
    byDay.set(r.dueDate, cur);
  }

  const move = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYm(d.toISOString().slice(0, 7));
  };

  const monthTotal = [...byDay.values()].reduce((s, v) => s + v.amount, 0);

  return (
    <>
      <PageHeader
        title="Calendario de vencimientos"
        description="Facturas a crédito que vencen cada día del mes."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Calendario" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => move(-1)} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">
              {MESES[month - 1]} {year}
            </span>
            <Button size="sm" variant="outline" onClick={() => move(1)} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {loading && <Skeleton className="h-96 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {!loading && !error && (
        <Card>
          <CardContent>
            <div className="mb-3 text-sm opacity-70">
              Vencimientos del mes: <strong>{money(monthTotal)}</strong>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DIAS.map((d) => (
                <div key={d} className="pb-1 text-center text-xs font-medium opacity-50">{d}</div>
              ))}
              {Array.from({ length: startCol }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const iso = `${ym}-${String(day).padStart(2, "0")}`;
                const info = byDay.get(iso);
                const isToday = iso === hoy;
                return (
                  <div
                    key={iso}
                    className={`min-h-20 rounded-lg border p-1.5 text-xs ${
                      isToday ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-black/5"
                    }`}
                  >
                    <div className={`font-medium ${isToday ? "text-[color:var(--brand-accent)]" : "opacity-60"}`}>{day}</div>
                    {info && (
                      <div className="mt-1 space-y-0.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${DOT[info.worst]}`} />
                        <div className="font-medium leading-tight">{info.count} fact.</div>
                        <div className="tabular-nums leading-tight opacity-70">{money(info.amount)}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs opacity-70">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Al día</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Por vencer</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" />Vencida 1-30</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />31-60</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-900" />+60</span>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
