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
  Archive,
} from "lucide-react";
import { AGING_LABEL, AGING_ORDER } from "@/features/receivables/aging";
import { arApi, money, type ArSummary } from "@/features/receivables/receivables-client";

/**
 * Desglose del total por cobrar: cuánto es del sistema y cuánto viene del
 * histórico migrado de Alegra. Las de Alegra están dentro del total —es dinero
 * que el negocio tiene por cobrar— pero se cobran en Alegra, no aquí.
 *
 * El `?? ` no sobra: si una respuesta vieja llegara sin el desglose, el panel
 * tiene que seguir enseñando el total, no romperse entero.
 */
function desgloseAlegra(s: ArSummary): { total: number; facturas: number } {
  return s.porOrigen?.alegra ?? { total: 0, facturas: 0 };
}

/**
 * Texto del desglose bajo «Total por cobrar».
 */
function hintPendiente(s: ArSummary): string {
  const plural = (n: number) => (n === 1 ? "factura" : "facturas");
  const alegra = desgloseAlegra(s);
  if (alegra.facturas === 0) {
    return `${s.facturasPendientes} ${plural(s.facturasPendientes)}`;
  }
  const sistema = s.porOrigen?.sistema ?? { total: 0, facturas: 0 };
  return (
    `${s.facturasPendientes} ${plural(s.facturasPendientes)} · ` +
    `${sistema.facturas} del sistema (${money(sistema.total)}), ` +
    `${alegra.facturas} migradas de Alegra (${money(alegra.total)})`
  );
}

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
              // De dónde sale el total: cuánto debe el sistema propio y cuánto
              // arrastra el histórico migrado. Un total que suma dos sistemas
              // sin decir cuánto pone cada uno no se puede cuadrar con ninguno.
              hint={hintPendiente(s)}
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
              hint="cobrado / (cobrado + pendiente) · solo ventas del sistema"
              icon={FileText}
              href="/cuentas-por-cobrar/reportes"
            />
          </div>

          {desgloseAlegra(s).facturas > 0 && (
            <Card className="mt-6 border-sky-200 bg-sky-50">
              <CardContent className="flex items-start gap-2 py-3 text-sm text-sky-900">
                <Archive className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{money(desgloseAlegra(s).total)}</strong> de lo pendiente son{" "}
                  <strong>{desgloseAlegra(s).facturas}</strong> facturas migradas de Alegra. Cuentan
                  en el total —es dinero por cobrar— pero <strong>no se cobran desde DermaLand</strong>:
                  el pago se registra en Alegra, o los dos sistemas dejarían de cuadrar.{" "}
                  <a className="underline" href="/cuentas-por-cobrar/alegra">Ver los saldos de Alegra</a>
                </span>
              </CardContent>
            </Card>
          )}

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
