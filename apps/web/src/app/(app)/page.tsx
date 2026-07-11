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
  isToday,
  isSameCalendarMonth,
} from "@/lib/utils/format";
import { useProformas } from "@/features/sales/proforma-store";
import { isInvoiceDocument } from "@/features/sales/document-label";
import {
  useCurrentCashSession,
} from "@/features/sales/cash-session-store";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import { useProducts } from "@/features/products/product-store";
import { useAllLots, totalSellableStock } from "@/features/inventory/lot-store";
import { lotsExpiringWithin, blockedLots } from "@/features/inventory/lot-selectors";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import { useCustomers } from "@/features/customers/customer-store";
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

const SALE_DONE = new Set(["paid", "partially_paid", "issued", "converted_to_ecf"]);

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

  // "Ventas hoy" = facturas (NCF/e-CF) emitidas HOY. MISMA definición que la
  // pantalla /ventas (isInvoiceDocument) → el KPI y `/ventas?period=today`
  // cuentan exactamente lo mismo (coherencia KPI↔detalle).
  const salesTodayDocs = React.useMemo(
    () =>
      proformas.filter((p) => isInvoiceDocument(p) && isToday(p.createdAt)),
    [proformas],
  );
  const salesToday = salesTodayDocs.reduce((s, p) => s + p.total, 0);
  const transactionsToday = salesTodayDocs.length;

  // Actividad de ventas del día (para el listado "Ventas recientes"): proformas
  // y facturas completadas hoy, más recientes primero.
  const todayProformas = React.useMemo(
    () =>
      proformas
        .filter((p) => isToday(p.createdAt) && SALE_DONE.has(p.status))
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [proformas],
  );

  // Lotes próximos a vencer (≤90 días, sucursales activas) — MISMO selector que
  // `/inventario/vencimientos?days=90`. Sin cap: el KPI cuenta TODOS, no 5.
  const expiringSoon = React.useMemo(
    () => lotsExpiringWithin(lots, activeBranchIds, 90),
    [lots, activeBranchIds],
  );

  const lowStockProducts = React.useMemo(
    () =>
      products
        .map((p) => ({ p, stock: totalSellableStock(lots, p.id, activeBranchIds) }))
        .filter((x) => x.stock <= x.p.minStock)
        .slice(0, 5),
    [products, lots, activeBranchIds],
  );

  // Lotes bloqueados (cuarentena + recall) — MISMO selector que
  // `/inventario/bloqueados`. Cuadra con la etiqueta "Cuarentena + recall".
  const blocked = React.useMemo(() => blockedLots(lots), [lots]);

  const recentLogs = mockAuditLogs.slice(0, 6);

  // Clientes nuevos del mes ACTUAL — MISMA definición que
  // `/clientes?created=this_month`.
  const newCustomersThisMonth = React.useMemo(
    () => customers.filter((c) => isSameCalendarMonth(c.createdAt)).length,
    [customers],
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
  const saleDocs = React.useMemo(
    () => proformas.filter((p) => SALE_DONE.has(p.status)),
    [proformas],
  );
  const branchNameById = React.useMemo(
    () => new Map(activeBranches.map((b) => [b.id, b.name])),
    [activeBranches],
  );
  const branchSales = React.useMemo(
    () => salesByBranch(saleDocs, (id) => branchNameById.get(id) ?? ""),
    [saleDocs, branchNameById],
  );
  const methodSales = React.useMemo(() => paymentsByMethod(saleDocs), [saleDocs]);
  const trend = React.useMemo(() => monthlyTrend(saleDocs, 6), [saleDocs]);
  const topProds = React.useMemo(() => topProducts(saleDocs, 5), [saleDocs]);
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
            <Button variant="outline" size="sm">
              <CalendarClock className="h-4 w-4" />
              Período
            </Button>
            <Link href="/pos">
              <Button size="sm">
                <ShoppingCart className="h-4 w-4" />
                Abrir POS
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ventas hoy"
          value={formatCurrency(salesToday)}
          hint={`${transactionsToday} ${transactionsToday === 1 ? "factura" : "facturas"}`}
          icon={Coins}
          tone="primary"
          href="/ventas?period=today"
          ariaLabel={`Ventas de hoy: ${formatCurrency(salesToday)} en ${transactionsToday} facturas. Ver ventas de hoy.`}
        />
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
          hint="este mes"
          icon={Users}
          href="/clientes?created=this_month"
          ariaLabel={`${newCustomersThisMonth} clientes nuevos este mes. Ver clientes nuevos.`}
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
        <ChartCard title="Tendencia mensual (ventas)" href="/ventas" linkLabel="Ver ventas →">
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
