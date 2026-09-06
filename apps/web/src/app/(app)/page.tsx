"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Box,
  CalendarClock,
  Coins,
  HeartPulse,
  Package,
  Receipt,
  ScanBarcode,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import {
  formatCurrency,
  formatDateTime,
  daysUntil,
  formatDate,
  formatNumber,
} from "@/lib/utils/format";
import { useProformas } from "@/features/sales/proforma-store";
import {
  useCurrentCashSession,
} from "@/features/sales/cash-session-store";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import { useProducts } from "@/features/products/product-store";
import { useAllLots, totalSellableStock } from "@/features/inventory/lot-store";
import { lotsExpiringWithin, blockedLots } from "@/features/inventory/lot-selectors";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import { BranchFilter, branchMatches, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { useCustomers } from "@/features/customers/customer-store";
import {
  matchesPeriod,
  availableYears,
  MONTH_NAMES,
  type MonthFilter,
  type YearFilter,
} from "@/features/dashboard/dashboard-filters";
import { Select } from "@/components/ui";
import { getProductById } from "@/lib/mock-data/catalog";
import { mockAuditLogs } from "@/lib/mock-data/users";
import {
  mockInventoryCounts,
  isPendingInventoryCount,
} from "@/lib/mock-data/inventory-counts";
import { ChartCard, BarChart, DonutChart, TrendChart } from "@/features/dashboard/charts";
import {
  salesByBranch,
  paymentsByMethod,
  monthlyTrend,
  topProducts,
  buildInsights,
} from "@/features/dashboard/dashboard-metrics";
import { CheckCircle2, Info, AlertCircle } from "lucide-react";
import type { Proforma } from "@/types";
// Segunda fuente de "Ventas del período": el resumen YA CALCULADO de
// `/api/ventas?vista=resumen` (sistema + histórico migrado de Alegra). Solo
// se toman los TIPOS (borrado en compilación, no arrastra código de servidor
// al bundle del cliente) — la lógica de negocio (excluir anuladas, sumar en
// centavos) vive en esos módulos y no se reimplementa aquí.
import type { DesgloseOrigen } from "@/features/ventas/agregados";
import type { OrigenVenta } from "@/features/ventas/venta-unificada";

const SALE_DONE = new Set(["paid", "partially_paid", "issued", "converted_to_ecf"]);

// ── Ventas migradas de Alegra: helpers puros (sin red, sin reloj) ──────────
// El panel NUNCA descarga filas para sumarlas (ver "El rendimiento no es un
// extra de este plan" en la spec): pide el resumen ya calculado en la base y
// solo interpreta esa respuesta pequeña.

/** Espejo de `ResumenVentas["porOrigen"]` (server/repositories/supabase/ventas-unificadas.ts). */
interface ResumenVentasApi {
  porOrigen: Record<OrigenVenta, DesgloseOrigen>;
}

/** Número seguro desde JSON sin tipar: NaN/Infinity/ausente caen a 0 (nunca se confía a ciegas en la red). */
function numeroSeguro(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function comoDesglose(v: unknown): DesgloseOrigen {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { total: numeroSeguro(o.total), cantidad: numeroSeguro(o.cantidad) };
}

/** Interpreta el JSON de `GET /api/ventas?vista=resumen`. */
function comoResumenVentas(json: unknown): ResumenVentasApi {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const r = (o.resumen && typeof o.resumen === "object" ? o.resumen : {}) as Record<string, unknown>;
  const po = (r.porOrigen && typeof r.porOrigen === "object" ? r.porOrigen : {}) as Record<string, unknown>;
  return { porOrigen: { sistema: comoDesglose(po.sistema), alegra: comoDesglose(po.alegra) } };
}

/** Mensaje de error del cuerpo de una respuesta no-OK, si lo trae (ver `toUserFacingMessage`). */
function comoMensajeError(json: unknown): string | null {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return typeof o.error === "string" ? o.error : null;
}

/**
 * Rango `desde`/`hasta` (YYYY-MM-DD, inclusive) para pedir el resumen de
 * Alegra según los filtros de mes/año del panel. `resumen_ventas_unificadas`
 * (la función de la base) solo entiende un rango continuo — no "este mes en
 * cualquier año" —, así que da `null` (sin acotar por fecha) cuando no hace
 * falta rango (los dos "Todos") y también en el único combo que un rango no
 * puede expresar: mes fijo + año "Todos". Ese combo se detecta aparte
 * (`mesSinAnioNoSoportado`, dentro del componente) para avisar en vez de
 * pedir sin querer el histórico completo de Alegra.
 */
function rangoParaResumen(month: MonthFilter, year: YearFilter): { desde: string; hasta: string } | null {
  if (year === "all") return null;
  if (month === "all") return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
  const anio = Number(year);
  const mes = Number(month);
  const mm = String(mes).padStart(2, "0");
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
}

/**
 * Texto del desglose por origen bajo "Ventas del período": cuánto puso el
 * sistema y cuánto es histórico migrado. Un total que mezcla dos fuentes sin
 * decir cuánto pone cada una no se puede auditar.
 */
function textoDesgloseOrigen(cantidadSistema: number, cantidadAlegra: number): string {
  const total = cantidadSistema + cantidadAlegra;
  const plural = (n: number) => (n === 1 ? "venta" : "ventas");
  if (total === 0) return "Sin ventas en el período.";
  if (cantidadAlegra === 0) return `${formatNumber(cantidadSistema)} ${plural(cantidadSistema)} del sistema`;
  if (cantidadSistema === 0) {
    return `${formatNumber(cantidadAlegra)} ${plural(cantidadAlegra)} · todas migradas de Alegra`;
  }
  return (
    `${formatNumber(total)} ${plural(total)} · ${formatNumber(cantidadSistema)} del sistema, ` +
    `${formatNumber(cantidadAlegra)} migradas de Alegra`
  );
}

/** Estado de la carga del resumen de Alegra: nunca un cero que parezca un dato mientras está en camino. */
type EstadoResumenAlegra =
  | { tipo: "cargando" }
  | { tipo: "listo"; resumen: ResumenVentasApi }
  | { tipo: "error"; mensaje: string };

export default function DashboardPage() {
  // Datos REALES (Supabase o local según DATA_SOURCE). Antes el dashboard
  // leía seeds estáticos y los KPIs mostraban cifras fijas.
  const proformas = useProformas();
  const products = useProducts();
  const lots = useAllLots();
  const customers = useCustomers();
  const activeBranches = useActiveBranches();
  const { session: cashSession } = useCurrentCashSession();
  const activeBranchIds = React.useMemo(
    () => new Set(activeBranches.map((b) => b.id)),
    [activeBranches],
  );

  // ── Filtros del dashboard: sucursal / mes / año (Todos por defecto) ──────────
  const [branchFilter, setBranchFilter] = React.useState(ALL_BRANCHES);
  const [monthFilter, setMonthFilter] = React.useState<MonthFilter>("all");
  const [yearFilter, setYearFilter] = React.useState<YearFilter>("all");
  const years = React.useMemo(
    () => availableYears(proformas.map((p) => p.createdAt)),
    [proformas],
  );
  // Sucursales dentro del alcance del filtro (para las métricas de inventario,
  // que son "ahora" y solo dependen de la sucursal, no del mes/año).
  const scopedBranchIds = React.useMemo(() => {
    if (branchFilter === ALL_BRANCHES) return activeBranchIds;
    return new Set(activeBranchIds.has(branchFilter) ? [branchFilter] : []);
  }, [branchFilter, activeBranchIds]);
  const inPeriod = React.useCallback(
    (dateIso: string, respectBranch: boolean, branchId?: string) =>
      matchesPeriod(dateIso, monthFilter, yearFilter) &&
      (!respectBranch || branchMatches(branchId ?? "", branchFilter)),
    [monthFilter, yearFilter, branchFilter],
  );

  // "Ventas hoy" = facturas (NCF/e-CF) emitidas HOY. MISMA definición que la
  // pantalla /ventas (isInvoiceDocument) → el KPI y `/ventas?period=today`
  // cuentan exactamente lo mismo (coherencia KPI↔detalle).
  // Ventas completadas dentro del filtro (sucursal + mes + año). Fuente única de
  // las métricas y gráficos de ventas del dashboard.
  const filteredSaleDocs = React.useMemo(
    () =>
      proformas.filter(
        (p) =>
          SALE_DONE.has(p.status) &&
          branchMatches(p.branchId, branchFilter) &&
          matchesPeriod(p.createdAt, monthFilter, yearFilter),
      ),
    [proformas, branchFilter, monthFilter, yearFilter],
  );
  const salesToday = filteredSaleDocs.reduce((s, p) => s + p.total, 0);
  const transactionsToday = filteredSaleDocs.length;

  // ── Ventas migradas de Alegra: segunda fuente, sumada a la del sistema ──
  // NO se toca `useProformas` ni `salesToday`/`transactionsToday` de arriba:
  // esto es una fuente AL LADO. Se pide el RESUMEN (`vista=resumen`), nunca
  // las filas — traer las 14 965 facturas al navegador para sumarlas es
  // exactamente el problema que este trabajo corrige.
  const sucursalIdResumen = branchFilter === ALL_BRANCHES ? undefined : branchFilter;
  const rangoResumen = React.useMemo(
    () => rangoParaResumen(monthFilter, yearFilter),
    [monthFilter, yearFilter],
  );
  const mesSinAnioNoSoportado = monthFilter !== "all" && yearFilter === "all";
  const [resumenAlegra, setResumenAlegra] = React.useState<EstadoResumenAlegra>({ tipo: "cargando" });

  React.useEffect(() => {
    // El combo "mes fijo + año Todos" no es un rango continuo: no hay nada
    // que pedirle a la base sin mentir sobre el filtro (ver `rangoParaResumen`).
    if (mesSinAnioNoSoportado) return;
    const ctrl = new AbortController();
    setResumenAlegra({ tipo: "cargando" });
    const params = new URLSearchParams({ vista: "resumen" });
    if (sucursalIdResumen) params.set("sucursalId", sucursalIdResumen);
    if (rangoResumen) {
      params.set("desde", rangoResumen.desde);
      params.set("hasta", rangoResumen.hasta);
    }
    fetch(`/api/ventas?${params.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(comoMensajeError(json) ?? "No se pudo cargar el histórico migrado de Alegra.");
        }
        return comoResumenVentas(json);
      })
      .then((resumen) => setResumenAlegra({ tipo: "listo", resumen }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResumenAlegra({
          tipo: "error",
          // La migración `20260906130000_resumen_ventas_unificadas.sql` puede no
          // estar aplicada todavía: la API responde 400 con un mensaje claro en
          // vez de camuflarlo, y aquí se enseña sin fingir un RD$0.00 silencioso.
          mensaje: e instanceof Error ? e.message : "No se pudo cargar el histórico migrado de Alegra.",
        });
      });
    return () => ctrl.abort();
  }, [sucursalIdResumen, rangoResumen, mesSinAnioNoSoportado]);

  // Mientras el resumen está en camino no hay número fiable que enseñar en
  // "Ventas del período" — ni siquiera el del sistema solo: hoy `proformas`
  // está vacía y ese RD$0.00 es EXACTAMENTE lo que hizo pensar que los datos
  // no se habían migrado. Se enseña un indicador de carga, nunca un cero que
  // parezca un dato. En el combo sin soporte o si la carga falla, se cae a lo
  // que ya se tenía (el sistema) con un aviso — nunca en silencio.
  const cargandoAlegra = !mesSinAnioNoSoportado && resumenAlegra.tipo === "cargando";
  const alegraDesglose =
    !mesSinAnioNoSoportado && resumenAlegra.tipo === "listo" ? resumenAlegra.resumen.porOrigen.alegra : null;
  const ventasTotal = salesToday + (alegraDesglose?.total ?? 0);
  const ventasCantidad = transactionsToday + (alegraDesglose?.cantidad ?? 0);
  const ventasCaption: { aviso: boolean; texto: string } = mesSinAnioNoSoportado
    ? {
        aviso: true,
        texto:
          "El histórico migrado de Alegra no admite un mes sin año: elige también un año para incluirlo. Mostrando solo lo del sistema.",
      }
    : resumenAlegra.tipo === "cargando"
      ? { aviso: false, texto: "Cargando el histórico migrado de Alegra…" }
      : resumenAlegra.tipo === "error"
        ? {
            aviso: true,
            texto: "No se pudo cargar el histórico migrado de Alegra. Mostrando solo lo del sistema.",
          }
        : { aviso: false, texto: textoDesgloseOrigen(transactionsToday, alegraDesglose?.cantidad ?? 0) };

  // Actividad de ventas del día (para el listado "Ventas recientes"): proformas
  // y facturas completadas hoy, más recientes primero.
  const todayProformas = React.useMemo(
    () =>
      [...filteredSaleDocs].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [filteredSaleDocs],
  );

  // Lotes próximos a vencer (≤90 días, sucursales activas) — MISMO selector que
  // `/inventario/vencimientos?days=90`. Sin cap: el KPI cuenta TODOS, no 5.
  const expiringSoon = React.useMemo(
    () => lotsExpiringWithin(lots, scopedBranchIds, 90),
    [lots, scopedBranchIds],
  );

  const lowStockProducts = React.useMemo(
    () =>
      products
        .map((p) => ({ p, stock: totalSellableStock(lots, p.id, scopedBranchIds) }))
        .filter((x) => x.stock <= x.p.minStock)
        .slice(0, 5),
    [products, lots, scopedBranchIds],
  );

  // Lotes bloqueados (cuarentena + recall) — MISMO selector que
  // `/inventario/bloqueados`, acotado a la sucursal del filtro.
  const blocked = React.useMemo(
    () => blockedLots(lots).filter((l) => scopedBranchIds.has(l.branchId)),
    [lots, scopedBranchIds],
  );

  const recentLogs = mockAuditLogs.slice(0, 6);

  // Clientes nuevos del mes ACTUAL — MISMA definición que
  // `/clientes?created=this_month`.
  const newCustomersThisMonth = React.useMemo(
    () => customers.filter((c) => matchesPeriod(c.createdAt, monthFilter, yearFilter)).length,
    [customers, monthFilter, yearFilter],
  );

  // Inventarios pendientes (borrador + en progreso) — MISMO predicado que
  // `/conteo-fisico?status=pending`.
  const pendingCounts = mockInventoryCounts.filter(isPendingInventoryCount).length;

  // Caja actual — sesión REAL desde el mismo repositorio que /caja (nunca un
  // valor fijo). El efectivo esperado se recalcula con la MISMA función pura
  // que /caja (computeShiftDetail); los movimientos manuales de efectivo, poco
  // frecuentes, se ven solo en la pantalla de caja.
  const cashDetail = React.useMemo(() => {
    if (!cashSession) return null;
    const sessionProformas = proformas.filter(
      (p) => p.cashRegisterSessionId === cashSession.id,
    );
    return computeShiftDetail(cashSession, sessionProformas, []);
  }, [cashSession, proformas]);

  // ── Gráficos ejecutivos (mismas ventas completadas que "Ventas recientes") ──
  const branchNameById = React.useMemo(
    () => new Map(activeBranches.map((b) => [b.id, b.name])),
    [activeBranches],
  );
  const branchSales = React.useMemo(
    () => salesByBranch(filteredSaleDocs, (id) => branchNameById.get(id) ?? ""),
    [filteredSaleDocs, branchNameById],
  );
  const methodSales = React.useMemo(() => paymentsByMethod(filteredSaleDocs), [filteredSaleDocs]);
  // La tendencia mensual es una serie de tiempo (últimos 6 meses): respeta la
  // sucursal pero NO el mes/año elegidos (colapsarían la serie a un punto).
  const trendDocs = React.useMemo(
    () =>
      proformas.filter(
        (p) => SALE_DONE.has(p.status) && branchMatches(p.branchId, branchFilter),
      ),
    [proformas, branchFilter],
  );
  const trend = React.useMemo(() => monthlyTrend(trendDocs, 6), [trendDocs]);
  const topProds = React.useMemo(() => topProducts(filteredSaleDocs, 5), [filteredSaleDocs]);
  const insights = React.useMemo(
    () =>
      buildInsights({
        branchLeader: branchSales[0],
        topProduct: topProds[0],
        criticalExpiring: expiringSoon.filter((l) => daysUntil(l.expiresAt) < 15).length,
        lowStock: lowStockProducts.length,
        formatCurrency,
      }),
    [branchSales, topProds, expiringSoon, lowStockProducts],
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen de operación de DermaLand Santiago — sucursal piloto"
        actions={
          <>
            <Link href="/pos">
              <Button size="sm">
                <ShoppingCart className="h-4 w-4" />
                Abrir POS
              </Button>
            </Link>
          </>
        }
      />

      {/* Filtros: sucursal / mes / año (Todos por defecto). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm opacity-70">Filtros:</span>
        <BranchFilter value={branchFilter} onChange={setBranchFilter} />
        <Select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          aria-label="Mes"
          className="w-auto"
        >
          <option value="all">Todos los meses</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          aria-label="Año"
          className="w-auto"
        >
          <option value="all">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <StatCard
            label="Ventas del período"
            value={cargandoAlegra ? "Cargando…" : formatCurrency(ventasTotal)}
            hint={
              cargandoAlegra
                ? undefined
                : `${formatNumber(ventasCantidad)} ${ventasCantidad === 1 ? "venta" : "ventas"}`
            }
            icon={Coins}
            tone="primary"
            href="/ventas"
            ariaLabel={
              cargandoAlegra
                ? "Ventas del período: cargando."
                : `Ventas del período: ${formatCurrency(ventasTotal)} en ${ventasCantidad} ventas. Ver ventas.`
            }
          />
          {/* Desglose por origen: sistema vs. migrado de Alegra. Un total que
              mezcla dos fuentes sin decir cuánto pone cada una no se puede
              auditar (plan "alegra-integrada-al-sistema"). */}
          <p
            className={
              ventasCaption.aviso
                ? "flex items-start gap-1 px-1 text-[11px] leading-snug text-amber-700"
                : "px-1 text-[11px] leading-snug opacity-55"
            }
          >
            {ventasCaption.aviso && (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            )}
            <span>{ventasCaption.texto}</span>
          </p>
        </div>
        <StatCard
          label="Productos en catálogo"
          value={products.length.toLocaleString("es-DO")}
          hint="activos e inactivos"
          icon={Package}
          href="/productos"
          ariaLabel={`${products.length} productos en el catálogo. Ver catálogo.`}
        />
        <StatCard
          label="Lotes próximos a vencer"
          value={expiringSoon.length}
          hint="≤ 90 días"
          icon={CalendarClock}
          tone="warning"
          href="/inventario/vencimientos?days=90"
          ariaLabel={`${expiringSoon.length} lotes próximos a vencer en 90 días o menos. Ver vencimientos.`}
        />
        <StatCard
          label="Lotes bloqueados"
          value={blocked.length}
          hint="Cuarentena + recall"
          icon={ShieldAlert}
          tone="danger"
          href="/inventario/bloqueados"
          ariaLabel={`${blocked.length} lotes bloqueados entre cuarentena y recall. Ver lotes bloqueados.`}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clientes nuevos"
          value={newCustomersThisMonth}
          hint="en el período"
          icon={Users}
          href="/clientes"
          ariaLabel={`${newCustomersThisMonth} clientes nuevos en el período. Ver clientes.`}
        />
        <StatCard
          label="Inventarios pendientes"
          value={pendingCounts}
          hint="Borrador + en progreso"
          icon={ScanBarcode}
          href="/conteo-fisico?status=pending"
          ariaLabel={`${pendingCounts} inventarios físicos pendientes. Ver inventarios pendientes.`}
        />
        <StatCard
          label="Caja actual"
          value={cashSession ? formatCurrency(cashDetail?.expectedCash ?? cashSession.expectedCash) : "Sin sesión"}
          hint={
            cashSession
              ? `Sesión ${cashSession.sessionNumber} · ${cashSession.cashierName}`
              : "Toca para abrir caja"
          }
          icon={Receipt}
          href="/caja"
          ariaLabel={
            cashSession
              ? `Caja actual: efectivo esperado ${formatCurrency(cashDetail?.expectedCash ?? cashSession.expectedCash)}, sesión ${cashSession.sessionNumber}. Ver caja.`
              : "No hay caja abierta. Abrir caja."
          }
        />
        <StatCard
          label="DGII"
          value="Inactivo"
          hint="Pendiente de certificado"
          icon={AlertTriangle}
          tone="warning"
          href="/dgii"
          ariaLabel="Módulo DGII inactivo, pendiente de certificado. Ver estado del módulo DGII."
        />
      </div>

      {/* Estatus Fiscal DGII — tarjeta destacada (como el diseño clínico) */}
      <div className="mt-6">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Receipt className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs uppercase tracking-wider text-black/50">Estatus Fiscal DGII</div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                  Inactivo
                </div>
                <div className="text-xs opacity-60">Emisión real apagada · pendiente de certificado</div>
              </div>
            </div>
            <Link
              href="/dgii"
              className="text-sm font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              Ver configuración →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Gráficos ejecutivos (ventas del mes / tendencia) ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Ventas por sucursal" href="/reportes/ventas">
          <BarChart data={branchSales} />
        </ChartCard>
        <ChartCard title="Cobros por método de pago" href="/reportes/caja">
          <DonutChart data={methodSales} formatValue={formatCurrency} />
        </ChartCard>
        <ChartCard title="Tendencia mensual (ventas)" href="/ventas?period=all" linkLabel="Ver ventas →">
          <TrendChart data={trend} />
        </ChartCard>
      </div>

      {/* ── Top productos + Insights del período ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Top productos del mes"
          href="/reportes/productos"
          linkLabel="Ver ranking completo →"
          className="lg:col-span-2"
        >
          {topProds.length === 0 ? (
            <p className="py-8 text-center text-sm opacity-50">Sin ventas este mes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                  <th className="pb-2 pr-2 text-left">#</th>
                  <th className="pb-2 pr-2 text-left">Producto</th>
                  <th className="pb-2 pr-2 text-right">Unidades</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {topProds.map((p, i) => (
                  <tr key={p.sku}>
                    <td className="py-2 pr-2 tabular-nums opacity-50">{i + 1}</td>
                    <td className="max-w-0 truncate py-2 pr-2 font-medium">{p.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{p.units}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{formatCurrency(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Vencimientos próximos</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Lotes a 90 días o menos. FEFO en POS los prioriza
                automáticamente.
              </p>
            </div>
            <Link
              href="/inventario/vencimientos?days=90"
              className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              Ver todos →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-black/5">
              {expiringSoon.length === 0 && (
                <li className="px-6 py-8 text-center text-sm opacity-60">
                  Sin lotes próximos a vencer en los próximos 90 días.
                </li>
              )}
              {expiringSoon.slice(0, 5).map((lot) => {
                const product = getProductById(lot.productId);
                const days = daysUntil(lot.expiresAt);
                const tone =
                  days < 15 ? "danger" : days < 45 ? "warning" : "info";
                return (
                  <li
                    key={lot.id}
                    className="flex items-center justify-between gap-3 px-6 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {product?.name}
                      </div>
                      <div className="text-xs opacity-60">
                        Lote {lot.lotNumber} · {lot.currentQuantity} unid.
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs opacity-60">
                        {formatDate(lot.expiresAt)}
                      </span>
                      <Badge tone={tone}>{days} días</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bajo stock</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Productos en o bajo el mínimo configurado.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStockProducts.length === 0 && (
              <p className="text-sm opacity-60">
                Todos los productos están sobre el mínimo.
              </p>
            )}
            {lowStockProducts.map(({ p, stock }) => {
              const target = Math.max(p.minStock, 1) * 2; // punto de reorden
              const pct = Math.min(100, Math.round((stock / target) * 100));
              const critical = stock === 0 || stock < p.minStock;
              return (
                <div key={p.id} className="rounded-lg bg-amber-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs opacity-60 font-mono">{p.sku}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Badge tone={critical ? "danger" : "warning"}>{stock} u.</Badge>
                      <span className="mt-1 text-[10px] opacity-50">Mín {p.minStock}</span>
                    </div>
                  </div>
                  {/* Stock Indicator: nivel actual vs punto de reorden */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                    <div
                      className={`h-full rounded-full ${critical ? "bg-rose-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Ventas recientes</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Proformas del día — sesión actual de caja.
              </p>
            </div>
            <Link
              href="/proformas"
              className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              Ver proformas →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-black/5">
              {todayProformas.length === 0 && (
                <li className="px-6 py-8 text-center text-sm opacity-60">
                  Aún no hay ventas registradas hoy.
                </li>
              )}
              {todayProformas.slice(0, 8).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.number} · {p.customerName}
                    </div>
                    <div className="text-xs opacity-60">
                      {p.cashierName} · {formatDateTime(p.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold">
                      {formatCurrency(p.total)}
                    </span>
                    <ProformaStatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auditoría reciente</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Acciones sensibles en los últimos minutos.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg p-2 hover:bg-black/[0.02]"
              >
                <div className="mt-1 h-2 w-2 rounded-full bg-[color:var(--brand-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{log.action}</span>
                    <span className="text-xs opacity-50">·</span>
                    <span className="text-xs opacity-60">{log.userName}</span>
                  </div>
                  <div className="text-xs opacity-50">
                    {log.entity} {log.entityId} · {formatDateTime(log.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Atajos rápidos</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                Tareas más comunes según tu rol y momento del día.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ShortcutTile
              href="/pos"
              icon={ShoppingCart}
              title="Abrir POS"
              description="Vender al mostrador"
            />
            <ShortcutTile
              href="/conteo-fisico/nuevo"
              icon={ScanBarcode}
              title="Nuevo inventario"
              description="Inventario físico por escaneo"
            />
            <ShortcutTile
              href="/recomendaciones/nueva"
              icon={HeartPulse}
              title="Recomendación"
              description="Crear rutina dermatológica"
            />
            <ShortcutTile
              href="/clientes/nuevo"
              icon={Users}
              title="Nuevo cliente"
              description="Registrar perfil"
            />
            <ShortcutTile
              href="/inventario/movimientos"
              icon={Box}
              title="Ajuste de inventario"
              description="Entrada/salida con motivo"
            />
            <ShortcutTile
              href="/whatsapp/conversaciones"
              icon={Receipt}
              title="WhatsApp"
              description="Conversaciones abiertas"
            />
            <ShortcutTile
              href="/reportes/caja"
              icon={Coins}
              title="Reporte de caja"
              description="Cierre del día"
            />
            <ShortcutTile
              href="/dgii/facturas"
              icon={Receipt}
              title="DGII e-CF"
              description="Facturas electrónicas"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ProformaStatusBadge({
  status,
}: {
  status: Proforma["status"];
}) {
  const map: Record<
    Proforma["status"],
    { label: string; tone: "success" | "warning" | "info" | "neutral" | "danger" }
  > = {
    paid: { label: "Pagada", tone: "success" },
    partially_paid: { label: "Pago parcial", tone: "warning" },
    issued: { label: "Emitida", tone: "info" },
    pending_ecf: { label: "Pendiente e-CF", tone: "warning" },
    converted_to_ecf: { label: "Convertida e-CF", tone: "success" },
    draft: { label: "Borrador", tone: "neutral" },
    cancelled: { label: "Cancelada", tone: "danger" },
    expired: { label: "Vencida", tone: "neutral" },
  };
  const v = map[status];
  return (
    <Badge tone={v.tone} className="mt-0.5 text-[10px]">
      {v.label}
    </Badge>
  );
}

function ShortcutTile({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-black/5 bg-white p-4 transition hover:border-[color:var(--brand-primary)]/40 hover:shadow-sm"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)] group-hover:bg-[color:var(--brand-primary)] group-hover:text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs opacity-60">{description}</div>
      </div>
    </Link>
  );
}
