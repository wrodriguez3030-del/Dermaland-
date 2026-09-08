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
import { esVentaCompletada } from "@/features/sales/venta-completada";
import {
  useCurrentCashSession,
} from "@/features/sales/cash-session-store";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import { BranchFilter, branchMatches, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { useClientesNuevos } from "@/features/dashboard/use-clientes-nuevos";
import { useResumenInventario } from "@/features/dashboard/use-resumen-inventario";
import {
  matchesPeriod,
  availableYears,
  mesSinAnio,
  rangoDelPeriodo,
  MONTH_NAMES,
  type MonthFilter,
  type YearFilter,
} from "@/features/dashboard/dashboard-filters";
import { Select } from "@/components/ui";
import { mockAuditLogs } from "@/lib/mock-data/users";
import {
  mockInventoryCounts,
  isPendingInventoryCount,
} from "@/lib/mock-data/inventory-counts";
import { TarjetasVentasPanel } from "@/features/dashboard/tarjetas-ventas";
import { VentasRecientes } from "@/features/dashboard/ventas-recientes";
// Segunda fuente de "Ventas del período": el resumen YA CALCULADO de
// `/api/ventas?vista=resumen` (sistema + histórico migrado de Alegra). El
// cliente de esa ruta —petición, lectura defensiva del JSON y el texto que
// explica el desglose— vive en `features/ventas/ventas-api.ts` y lo comparten
// las cuatro pantallas del plan: la frase que dice cuánto pone cada fuente no
// puede decir una cosa aquí y otra en los reportes.
import {
  textoDesgloseOrigen,
  useResumenVentas,
} from "@/features/ventas/ventas-api";

// El criterio de «venta hecha del sistema» vive en
// `features/sales/venta-completada.ts`: el asistente de IA cuenta lo mismo que
// esta pantalla, y una lista copiada en dos sitios se separa sola.

export default function DashboardPage() {
  // Datos REALES (Supabase o local según DATA_SOURCE). Antes el dashboard
  // leía seeds estáticos y los KPIs mostraban cifras fijas.
  const proformas = useProformas();
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
          esVentaCompletada(p.status) &&
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
    () => rangoDelPeriodo(monthFilter, yearFilter),
    [monthFilter, yearFilter],
  );
  const mesSinAnioNoSoportado = mesSinAnio(monthFilter, yearFilter);
  // El combo "mes fijo + año Todos" no es un rango continuo: no hay nada que
  // pedirle a la base sin mentir sobre el filtro (ver `rangoParaResumen`), así
  // que la petición ni se lanza.
  const resumenAlegra = useResumenVentas(
    {
      desde: rangoResumen?.desde,
      hasta: rangoResumen?.hasta,
      sucursalId: sucursalIdResumen,
    },
    !mesSinAnioNoSoportado,
  );

  // Mientras el resumen está en camino no hay número fiable que enseñar en
  // "Ventas del período" — ni siquiera el del sistema solo: hoy `proformas`
  // está vacía y ese RD$0.00 es EXACTAMENTE lo que hizo pensar que los datos
  // no se habían migrado. Se enseña un indicador de carga, nunca un cero que
  // parezca un dato. En el combo sin soporte o si la carga falla, se cae a lo
  // que ya se tenía (el sistema) con un aviso — nunca en silencio.
  const cargandoAlegra = !mesSinAnioNoSoportado && resumenAlegra.tipo === "cargando";
  const alegraDesglose =
    !mesSinAnioNoSoportado && resumenAlegra.tipo === "listo" ? resumenAlegra.datos.porOrigen.alegra : null;
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

  // 🔴 Todo el inventario del panel, calculado en la BASE. Antes esto eran tres
  // `useMemo` sobre el catálogo entero y todos los lotes: 2 675 KB de JSON al
  // navegador para quedarse con 1,3 KB. Eran los «par de segundos» al cargar.
  //
  // Los criterios (qué vence, qué está bloqueado, qué está bajo mínimo) son los
  // MISMOS de `lot-selectors.ts`, copiados a la función SQL: si dijeran otra
  // cosa, el panel y las pantallas de Vencimientos y Bloqueados darían números
  // distintos del mismo inventario.
  const sucursalesDelResumen = React.useMemo(
    () => [...scopedBranchIds],
    [scopedBranchIds],
  );
  const inventario = useResumenInventario(sucursalesDelResumen);

  const recentLogs = mockAuditLogs.slice(0, 6);

  // Clientes nuevos del período — MISMA definición que
  // `/clientes?created=this_month`, pero contados en la BASE.
  //
  // 🔴 Antes esto era `customers.filter(...).length` sobre la lista completa:
  // el panel se descargaba los 6 525 clientes (2,6 MB de JSON, medidos) para
  // contar unos pocos. Esa sola tarjeta era casi la mitad de lo que pesaba
  // abrir el panel.
  const clientesNuevos = useClientesNuevos(monthFilter, yearFilter);
  const newCustomersThisMonth = clientesNuevos.total;

  // Inventarios pendientes (borrador + en progreso) — MISMO predicado que
  // `/conteo-fisico?status=pending`.
  const pendingCounts = mockInventoryCounts.filter(isPendingInventoryCount).length;

  // Caja actual — sesión REAL desde el mismo repositorio que /caja (nunca un
  // valor fijo). El efectivo esperado se recalcula con la MISMA función pura
  // que /caja (computeShiftDetail); los movimientos manuales de efectivo, poco
  // frecuentes, se ven solo en la pantalla de caja.
  //
  // 🔴 Esta tarjeta NO cuenta el histórico migrado de Alegra, y está bien así.
  // No es una omisión como la de las otras cinco: el efectivo esperado se ata a
  // la sesión de caja abierta (`cashRegisterSessionId`) y las facturas de
  // Alegra no tienen sesión de caja en DermaLand — se cobraron en el sistema
  // anterior. Sumarlas aquí haría que el arqueo pidiera un dinero que nunca
  // entró en esta gaveta. Que solo cuente proformas es LO CORRECTO; no lo
  // «arregles».
  const cashDetail = React.useMemo(() => {
    if (!cashSession) return null;
    const sessionProformas = proformas.filter(
      (p) => p.cashRegisterSessionId === cashSession.id,
    );
    return computeShiftDetail(cashSession, sessionProformas, []);
  }, [cashSession, proformas]);

  // ── Tarjetas de ventas ──────────────────────────────────────────────────────
  // 🔴 Las cinco tarjetas de ventas del panel —sucursal, forma de pago,
  // tendencia, top productos y «Ventas recientes»— viven en
  // `features/dashboard/`. Se alimentaban SOLO de `proformas` (0 filas hoy) y
  // salían en blanco con RD$317 723,13 facturados en septiembre; ahora cada una
  // suma su mitad migrada de Alegra, pedida YA AGREGADA a la base. Están fuera
  // de este archivo porque ya rondaba las 830 líneas, por encima del máximo de
  // 800 de la casa.
  const branchNameById = React.useMemo(
    () => new Map(activeBranches.map((b) => [b.id, b.name])),
    [activeBranches],
  );
  const nombreDeSucursal = React.useCallback(
    (id: string) => branchNameById.get(id) ?? "",
    [branchNameById],
  );
  // La tendencia mensual es una serie de tiempo (últimos 6 meses): respeta la
  // sucursal pero NO el mes/año elegidos (colapsarían la serie a un punto).
  const trendDocs = React.useMemo(
    () =>
      proformas.filter(
        (p) => esVentaCompletada(p.status) && branchMatches(p.branchId, branchFilter),
      ),
    [proformas, branchFilter],
  );
  const vencimientosCriticos = inventario.resumen?.vencenPronto.criticos ?? 0;
  /** Los tres filtros que el histórico migrado sabe aplicar. */
  const filtrosHistorico = React.useMemo(
    () => ({ desde: rangoResumen?.desde, hasta: rangoResumen?.hasta, sucursalId: sucursalIdResumen }),
    [rangoResumen, sucursalIdResumen],
  );
  /**
   * El histórico participa en las tarjetas cuando el periodo se puede expresar
   * como un rango de fechas y su total no ha fallado. Es la MISMA condición que
   * decide si entra en el KPI de arriba: dos criterios distintos harían que el
   * número grande y las tarjetas contaran cosas distintas.
   */
  const historicoParticipa = !mesSinAnioNoSoportado && resumenAlegra.tipo !== "error";
  const historicoAviso = ventasCaption.aviso ? ventasCaption.texto : null;

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
          value={
            inventario.error
              ? "—"
              : (inventario.resumen?.totalProductos.toLocaleString("es-DO") ?? "…")
          }
          hint="activos e inactivos"
          icon={Package}
          href="/productos"
          ariaLabel={`${inventario.resumen?.totalProductos ?? "…"} productos en el catálogo. Ver catálogo.`}
        />
        <StatCard
          label="Lotes próximos a vencer"
          value={inventario.error ? "—" : (inventario.resumen?.vencenPronto.total ?? "…")}
          hint="≤ 90 días"
          icon={CalendarClock}
          tone="warning"
          href="/inventario/vencimientos?days=90"
          ariaLabel={`${inventario.resumen?.vencenPronto.total ?? "…"} lotes próximos a vencer en 90 días o menos. Ver vencimientos.`}
        />
        <StatCard
          label="Lotes bloqueados"
          value={inventario.error ? "—" : (inventario.resumen?.bloqueados ?? "…")}
          hint="Cuarentena + recall"
          icon={ShieldAlert}
          tone="danger"
          href="/inventario/bloqueados"
          ariaLabel={`${inventario.resumen?.bloqueados ?? "…"} lotes bloqueados entre cuarentena y recall. Ver lotes bloqueados.`}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 🔴 Mientras carga dice «…», y si falla dice que falló: un 0 por un
            fallo de red se lee como «no entró ni un cliente este mes», que es
            una afirmación sobre el negocio y no un hueco. */}
        <StatCard
          label="Clientes nuevos"
          value={
            clientesNuevos.error
              ? "—"
              : newCustomersThisMonth === null
                ? "…"
                : newCustomersThisMonth
          }
          hint={clientesNuevos.error ? "no se pudo contar" : "en el período"}
          icon={Users}
          href="/clientes"
          ariaLabel={
            clientesNuevos.error
              ? "No se pudo contar los clientes nuevos. Ver clientes."
              : `${newCustomersThisMonth ?? "…"} clientes nuevos en el período. Ver clientes.`
          }
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

      <TarjetasVentasPanel
        ventasDelPeriodo={filteredSaleDocs}
        ventasParaTendencia={trendDocs}
        nombreDeSucursal={nombreDeSucursal}
        filtros={filtrosHistorico}
        historicoParticipa={historicoParticipa}
        historicoCargando={cargandoAlegra}
        historicoAviso={historicoAviso}
        vencimientosCriticos={vencimientosCriticos}
        bajoStock={inventario.resumen?.bajoMinimo.total ?? 0}
      />

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
              {inventario.cargando && (
                <li className="px-6 py-8 text-center text-sm opacity-60">
                  Cargando el inventario…
                </li>
              )}
              {inventario.error && (
                <li className="px-6 py-8 text-center text-sm font-medium text-red-700">
                  No se pudo cargar el inventario: {inventario.error}
                </li>
              )}
              {!inventario.cargando &&
                !inventario.error &&
                inventario.resumen?.vencenPronto.total === 0 && (
                  <li className="px-6 py-8 text-center text-sm opacity-60">
                    Sin lotes próximos a vencer en los próximos 90 días.
                  </li>
                )}
              {(inventario.resumen?.vencenPronto.lista ?? []).map((lot) => {
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
                        {lot.productName}
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
            {inventario.cargando && <p className="text-sm opacity-60">Cargando…</p>}
            {!inventario.cargando &&
              !inventario.error &&
              inventario.resumen?.bajoMinimo.total === 0 && (
                <p className="text-sm opacity-60">
                  Todos los productos están sobre el mínimo.
                </p>
              )}
            {(inventario.resumen?.bajoMinimo.lista ?? []).map((p) => {
              const stock = p.stock;
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
        <VentasRecientes
          ventasDelSistema={filteredSaleDocs}
          filtros={filtrosHistorico}
          historicoParticipa={historicoParticipa}
        />

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
