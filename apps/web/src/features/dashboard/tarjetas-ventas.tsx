"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import { combinarDesglose } from "@/features/ventas/desglose-tarjeta";
import { useDesgloseVentas,
  useDesglosesVentas } from "@/features/ventas/ventas-api";
import type { Proforma } from "@/types";
import { BarChart, ChartCard, DonutChart, TrendChart } from "./charts";
import {
  buildInsights,
  mesesDeLaTendencia,
  monthlyTrend,
  paymentsByMethod,
  salesByBranch,
  topProducts,
} from "./dashboard-metrics";
import {
  mesesDelSistema,
  pagosDelSistema,
  productosDelSistema,
  reclavarPagoMigrado,
  reclavarSucursalMigrada,
  serieDeTendencia,
  sucursalesDelSistema,
  tarjetaDePanel,
  ventanaDeTendencia,
  type TarjetaPanel,
} from "./panel-ventas";

/**
 * Las cuatro tarjetas de ventas del panel, y los insights que salen de dos de
 * ellas.
 *
 * 🔴 Qué estaba roto. Las cuatro se alimentaban SOLO de `proformas`, que hoy
 * tiene 0 filas porque el punto de venta propio todavía no ha cobrado nada.
 * Con RD$317 723,13 facturados en septiembre, el dueño veía «Sin datos este
 * mes.» en tres de ellas y una línea plana en cero en la cuarta — y son las
 * que mira primero. Todo el histórico vive en `alegra_invoices`, y desde
 * `20260907120000_desglose_ventas_sucursal_mes.sql` la base sabe agruparlo por
 * las cinco dimensiones que hacen falta.
 *
 * 🔴 Ninguna de estas tarjetas descarga filas para contarlas. Cada una pide UN
 * desglose ya agrupado y sumado en la base (decenas de bytes), con tope de 200
 * grupos puesto por la propia función SQL y repetido en el repositorio. Traer
 * las 14 965 facturas al navegador para sumarlas es exactamente el problema
 * que este trabajo corrige.
 *
 * Sale de `page.tsx` porque ese archivo ya rondaba las 830 líneas —por encima
 * del máximo de 800 de la casa— y esto le añadía más.
 */

/** Filtros que el panel sabe mandarle a la base. */
export interface FiltrosPanel {
  /** `YYYY-MM-DD`, inclusive. */
  desde?: string | undefined;
  /** `YYYY-MM-DD`, inclusive. */
  hasta?: string | undefined;
  sucursalId?: string | undefined;
}

/**
 * Cabecera de una tarjeta: de dónde salen sus números, y qué falta.
 *
 * 🔴 Existe porque una barra, una porción de dona o un punto de una línea NO
 * pueden llevar una insignia, y en tabletas no hay hover: un `title` no cuenta
 * como decirlo. Así que el origen se dice a nivel de TARJETA, con la misma
 * etiqueta oficial (`EtiquetaOrigen`) que usan el resto de las pantallas.
 */
export function LeyendaTarjeta({ tarjeta }: { tarjeta: TarjetaPanel }) {
  const hayMigradas = tarjeta.origenes.includes("alegra");
  const hayPropias = tarjeta.origenes.includes("sistema");
  return (
    <div className="mb-2 min-h-[1.25rem]">
      {tarjeta.cargando && (
        <p className="text-[11px] opacity-60">Cargando el histórico migrado de Alegra…</p>
      )}
      {tarjeta.error && (
        <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {tarjeta.error}
        </p>
      )}
      {!tarjeta.cargando && !tarjeta.error && hayMigradas && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] opacity-70">
          <EtiquetaOrigen origen="alegra" />
          <span>
            {hayPropias
              ? "Suma las ventas del sistema y el histórico migrado."
              : "Todo lo que se ve aquí es histórico migrado."}
          </span>
        </p>
      )}
    </div>
  );
}

/** Las cuatro tarjetas de ventas del panel + los insights del período. */
export function TarjetasVentasPanel({
  ventasDelPeriodo,
  ventasParaTendencia,
  nombreDeSucursal,
  filtros,
  historicoParticipa,
  historicoCargando = false,
  historicoAviso = null,
  vencimientosCriticos,
  bajoStock,
}: {
  /** Ventas completadas del sistema dentro del filtro (sucursal + mes + año). */
  ventasDelPeriodo: Proforma[];
  /**
   * Ventas completadas del sistema para la TENDENCIA: respetan la sucursal
   * pero NO el mes/año, porque una serie de tiempo recortada a un mes se
   * colapsa a un solo punto. Es el criterio que ya tenía el panel.
   */
  ventasParaTendencia: Proforma[];
  nombreDeSucursal: (id: string) => string;
  filtros: FiltrosPanel;
  /**
   * `true` cuando el histórico puede participar: hoy es «el filtro de periodo
   * se puede expresar como un rango de fechas». El combo «mes fijo + año
   * Todos» no lo es, y entonces las tarjetas se quedan con lo del sistema y lo
   * DICEN.
   */
  historicoParticipa: boolean;
  /** `true` mientras el TOTAL del histórico (el del KPI de arriba) está en camino. */
  historicoCargando?: boolean | undefined;
  /** Aviso del KPI cuando el histórico no participa por algo que hay que explicar. */
  historicoAviso?: string | null | undefined;
  vencimientosCriticos: number;
  bajoStock: number;
}) {
  // Una sola foto del reloj para toda la tarjeta de tendencia: si los cubos y
  // la serie del sistema se calcularan con dos `new Date()` distintos, un
  // cambio de mes entre las dos líneas desplazaría la serie un punto.
  const ahora = React.useMemo(() => new Date(), []);
  const cubos = React.useMemo(() => mesesDeLaTendencia(6, ahora), [ahora]);
  const ventana = React.useMemo(() => ventanaDeTendencia(cubos), [cubos]);

  // ── Los agregados. Nunca filas ─────────────────────────────────────────────
  //
  // 🔴 Los tres que comparten filtros van en UNA petición. Antes eran tres
  // separadas y, con la de la tendencia, cuatro: medido en el navegador el
  // 08/09/2026, el panel disparaba TRECE peticiones al cargar. Cada una es una
  // función sin servidor con su propio arranque, y el navegador limita cuántas
  // lanza a la vez.
  const desgloses = useDesglosesVentas(
    ["sucursal", "forma_pago", "producto"],
    filtros,
    historicoParticipa,
  );
  const desgloseSucursal = desgloses.sucursal;
  const desglosePago = desgloses.forma_pago;
  const desgloseProducto = desgloses.producto;
  // 🔴 La tendencia va aparte y con SU PROPIA ventana de seis meses, sin el
  // filtro de mes/año: por eso se pide SIEMPRE, incluso en el combo «mes fijo +
  // año Todos» que las otras tres no saben pedir. Esa tarjeta nunca respetó el
  // periodo, así que ese combo no la afecta — y por eso NO puede ir en la
  // petición agrupada de arriba, que lleva otros filtros.
  const desgloseMes = useDesgloseVentas(
    "mes",
    { desde: ventana.desde, hasta: ventana.hasta, sucursalId: filtros.sucursalId },
    true,
  );

  // ── Las mitades del sistema, calculadas como siempre ───────────────────────
  const ventasSucursal = React.useMemo(
    () => salesByBranch(ventasDelPeriodo, nombreDeSucursal),
    [ventasDelPeriodo, nombreDeSucursal],
  );
  const cobrosMetodo = React.useMemo(() => paymentsByMethod(ventasDelPeriodo), [ventasDelPeriodo]);
  const productosTop = React.useMemo(() => topProducts(ventasDelPeriodo, 5), [ventasDelPeriodo]);
  const serieSistema = React.useMemo(
    () => monthlyTrend(ventasParaTendencia, 6, ahora),
    [ventasParaTendencia, ahora],
  );

  // ── Las dos mitades, juntas ────────────────────────────────────────────────
  const comun = { historicoParticipa, historicoCargando, historicoAviso };
  const tSucursal = tarjetaDePanel(
    combinarDesglose({ ...comun, sistema: sucursalesDelSistema(ventasSucursal), estado: desgloseSucursal }),
    // 🔴 Sin esto las dos mitades NO se funden: la del sistema va clavada por
    // `branches.id` y la migrada por `branch_id`, que es el mismo id salvo
    // cuando no hay sede. Villa Olga salía en dos barras bajo una cabecera que
    // decía «Suma las ventas del sistema y el histórico migrado», y el insight
    // llegó a nombrar líder a la sucursal equivocada.
    reclavarSucursalMigrada,
  );
  const tPago = tarjetaDePanel(
    combinarDesglose({ ...comun, sistema: pagosDelSistema(cobrosMetodo), estado: desglosePago }),
    // 🔴 La etiqueta traducida ES la clave con la que se funde: Alegra agrupa
    // por `cash` y el sistema por «Efectivo». Sin reclavar, la dona enseñaría
    // dos porciones «Efectivo» con la mitad del dinero cada una.
    reclavarPagoMigrado,
  );
  const tProducto = tarjetaDePanel(
    combinarDesglose({ ...comun, sistema: productosDelSistema(productosTop), estado: desgloseProducto }),
  );
  const tMes = tarjetaDePanel(
    combinarDesglose({
      // La tendencia no depende del combo de periodo, así que su histórico
      // participa siempre que su petición haya llegado.
      historicoParticipa: true,
      historicoCargando: false,
      historicoAviso: null,
      sistema: mesesDelSistema(serieSistema, cubos),
      estado: desgloseMes,
    }),
  );

  const serieTendencia = React.useMemo(() => serieDeTendencia(tMes.filas, cubos), [tMes.filas, cubos]);

  const insights = React.useMemo(
    () =>
      buildInsights({
        // 🔴 Los insights salen de las filas YA COMBINADAS. Antes salían de
        // `branchSales[0]` y `topProds[0]`, que sólo miraban `proformas`: con
        // la tabla vacía, el panel no tenía ni un titular de ventas.
        branchLeader: tSucursal.filas[0]
          ? { label: tSucursal.filas[0].etiqueta, value: tSucursal.filas[0].total }
          : undefined,
        topProduct: tProducto.filas[0]
          ? { name: tProducto.filas[0].etiqueta, total: tProducto.filas[0].total }
          : undefined,
        criticalExpiring: vencimientosCriticos,
        lowStock: bajoStock,
        formatCurrency,
      }),
    [tSucursal.filas, tProducto.filas, vencimientosCriticos, bajoStock],
  );

  const productosVisibles = tProducto.filas.slice(0, 5);
  const hayProductosMigrados = tProducto.origenes.includes("alegra");

  return (
    <>
      {/* ── Gráficos ejecutivos (ventas del mes / tendencia) ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Ventas por sucursal" href="/reportes/ventas">
          <LeyendaTarjeta tarjeta={tSucursal} />
          <BarChart data={tSucursal.filas.map((f) => ({ label: f.etiqueta, value: f.total }))} />
        </ChartCard>
        {/* Apunta a /reportes/ventas y no a /reportes/caja: el reporte de caja
            sigue contando SOLO el sistema, así que el dueño saldría de una
            tarjeta con RD$317 mil y aterrizaría en una pantalla con cero. El
            de ventas sí lleva el histórico, con su tabla «Medios de pago». */}
        <ChartCard
          title="Cobros por método de pago"
          href="/reportes/ventas"
          linkLabel="Ver medios de pago →"
        >
          <LeyendaTarjeta tarjeta={tPago} />
          <DonutChart
            data={tPago.filas.map((f) => ({ label: f.etiqueta, value: f.total }))}
            formatValue={formatCurrency}
          />
        </ChartCard>
        <ChartCard title="Tendencia mensual (ventas)" href="/ventas?period=all" linkLabel="Ver ventas →">
          <LeyendaTarjeta tarjeta={tMes} />
          <TrendChart data={serieTendencia} />
        </ChartCard>
      </div>

      {/* ── Top productos + Insights del período ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Mismo motivo que arriba: /reportes/productos no cuenta el histórico. */}
        <ChartCard
          title="Top productos del mes"
          href="/reportes/ventas"
          linkLabel="Ver ranking completo →"
          className="lg:col-span-2"
        >
          <LeyendaTarjeta tarjeta={tProducto} />
          {productosVisibles.length === 0 ? (
            <p className="py-8 text-center text-sm opacity-50">Sin ventas este mes.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                    <th className="pb-2 pr-2 text-left">#</th>
                    <th className="pb-2 pr-2 text-left">Producto</th>
                    {/* «Cant.» y no «Unidades»: en las filas migradas son
                        RENGLONES de factura. La nota de abajo lo explica. */}
                    <th className="pb-2 pr-2 text-right">Cant.</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {productosVisibles.map((p, i) => (
                    <tr key={p.clave || p.etiqueta}>
                      <td className="py-2 pr-2 tabular-nums opacity-50">{i + 1}</td>
                      <td className="max-w-0 truncate py-2 pr-2 font-medium">{p.etiqueta}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.cantidad)}</td>
                      <td className="py-2 text-right font-bold tabular-nums">
                        {formatCurrency(p.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hayProductosMigrados && (
                <p className="mt-2 border-t pt-2 text-[11px] opacity-60">
                  «Cant.» son unidades en las ventas del sistema y renglones de factura en las
                  migradas: el histórico de Alegra no trae la unidad con la precisión que hace falta
                  para sumarla. Es un ranking por importe, no un total.
                </p>
              )}
            </>
          )}
        </ChartCard>
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-bold">Insights del período</h3>
            <ul className="space-y-3">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  {ins.tone === "good" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : ins.tone === "warn" ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug">{ins.title}</div>
                    <div className="text-xs opacity-60">{ins.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
