"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import {
  Wallet,
  Coins,
  CalendarClock,
  FileText,
  AlertTriangle,
  Users,
  TrendingUp,
  Timer,
} from "lucide-react";
import { AGING_LABEL, AGING_ORDER } from "@/features/receivables/aging";
import { arApi, money, type ArSummary } from "@/features/receivables/receivables-client";

/** Dashboard ejecutivo de Cuentas por Cobrar (datos reales del negocio). */
export default function CxcDashboardPage() {
  const [s, setS] = React.useState<ArSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    arApi.summary().then(setS).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  return (
    <>
      <PageHeader
        title="Cuentas por cobrar"
        description="Ventas a crédito, saldos pendientes y recuperación."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Dashboard" }]}
      />

      {error && (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent className="py-4 text-sm text-rose-900">{error}</CardContent>
        </Card>
      )}

      {!s && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total por cobrar"
              value={money(s.totalPendiente)}
              hint={`${s.facturasPendientes} facturas`}
              icon={Wallet}
              tone="primary"
              href="/cuentas-por-cobrar/pendientes"
            />
            <StatCard
              label="Cobrado hoy"
              value={money(s.cobradoHoy)}
              icon={Coins}
              tone="success"
              href="/cuentas-por-cobrar/historial"
            />
            <StatCard
              label="Cobrado este mes"
              value={money(s.cobradoMes)}
              icon={TrendingUp}
              tone="success"
              href="/cuentas-por-cobrar/historial"
            />
            <StatCard
              label="Facturas vencidas"
              value={s.facturasVencidas}
              hint={money(s.montoVencido)}
              icon={AlertTriangle}
              tone={s.facturasVencidas > 0 ? "danger" : "default"}
              href="/cuentas-por-cobrar/mora"
            />
            <StatCard
              label="Clientes morosos"
              value={s.clientesMorosos}
              icon={Users}
              tone={s.clientesMorosos > 0 ? "warning" : "default"}
              href="/cuentas-por-cobrar/mora"
            />
            <StatCard
              label="Vencen en 7 días"
              value={s.proximos7Dias.count}
              hint={money(s.proximos7Dias.amount)}
              icon={CalendarClock}
              tone={s.proximos7Dias.count > 0 ? "warning" : "default"}
              href="/cuentas-por-cobrar/calendario"
            />
            <StatCard
              label="Promedio de cobranza"
              value={s.promedioDiasCobro != null ? `${s.promedioDiasCobro} días` : "—"}
              hint="emisión → cobro (últimos 6 meses)"
              icon={Timer}
            />
            <StatCard
              label="Recuperación mensual"
              value={s.recuperacionPct != null ? `${s.recuperacionPct}%` : "—"}
              hint="cobrado / (cobrado + pendiente)"
              icon={FileText}
              href="/cuentas-por-cobrar/reportes"
            />
          </div>

          {s.promesasHoy > 0 && (
            <Card className="mt-6 border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Hay <strong>{s.promesasHoy}</strong> promesa(s) de pago que vencen hoy o ya vencieron.{" "}
                  <a className="underline" href="/cuentas-por-cobrar/promesas">Revisar promesas</a>
                </span>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Antigüedad de saldos</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={AGING_ORDER.map((b) => ({ label: AGING_LABEL[b], value: s.aging.amount[b] }))}
                  formatter={money}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cobranza mensual (últimos 6 meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={s.cobradoPorMes} formatter={money} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Saldo pendiente por sucursal</CardTitle>
              </CardHeader>
              <CardContent>
                {s.porSucursal.length === 0 ? (
                  <p className="text-sm opacity-60">Sin saldos pendientes.</p>
                ) : (
                  <BarChart data={s.porSucursal} formatter={money} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Saldo pendiente por vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                {s.porVendedor.length === 0 ? (
                  <p className="text-sm opacity-60">Sin saldos pendientes.</p>
                ) : (
                  <BarChart data={s.porVendedor} formatter={money} />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
