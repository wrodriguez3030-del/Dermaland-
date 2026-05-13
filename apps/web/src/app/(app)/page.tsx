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
} from "@/lib/utils/format";
import { mockProformas } from "@/lib/mock-data/sales";
import {
  mockProductLots,
  mockProducts,
  totalStockForProduct,
  getProductById,
} from "@/lib/mock-data/catalog";
import { mockCustomers } from "@/lib/mock-data/customers";
import { mockAuditLogs } from "@/lib/mock-data/users";
import { mockInventoryCounts } from "@/lib/mock-data/inventory-counts";

export default function DashboardPage() {
  const todayProformas = mockProformas;
  const salesToday = todayProformas.reduce((s, p) => s + p.total, 0);
  const transactionsToday = todayProformas.length;

  const expiringSoon = mockProductLots
    .filter((l) => l.status === "available")
    .filter((l) => {
      const d = daysUntil(l.expiresAt);
      return d >= 0 && d <= 90;
    })
    .sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt))
    .slice(0, 5);

  const lowStockProducts = mockProducts
    .map((p) => ({ p, stock: totalStockForProduct(p.id) }))
    .filter((x) => x.stock <= x.p.minStock)
    .slice(0, 5);

  const quarantined = mockProductLots.filter(
    (l) => l.status === "quarantine" || l.status === "recalled",
  );

  const recentLogs = mockAuditLogs.slice(0, 6);

  const newCustomersThisMonth = mockCustomers.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getFullYear() === 2026 && d.getMonth() === 4; // Mayo
  }).length;

  const pendingCounts = mockInventoryCounts.filter(
    (c) => c.status === "in_progress" || c.status === "draft",
  ).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen de operación de DermaLand Santiago — sucursal piloto"
        actions={
          <>
            <Button variant="outline" size="sm">
              Cambiar período
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
          hint={`${transactionsToday} transacciones`}
          delta={{ value: 12.4 }}
          icon={Coins}
          tone="primary"
        />
        <StatCard
          label="Productos en catálogo"
          value="1,342"
          hint="13 marcas activas"
          icon={Package}
        />
        <StatCard
          label="Lotes próximos a vencer"
          value={expiringSoon.length}
          hint="≤ 90 días"
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Lotes bloqueados"
          value={quarantined.length}
          hint="Cuarentena + recall"
          icon={ShieldAlert}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clientes nuevos"
          value={newCustomersThisMonth}
          hint="este mes"
          icon={Users}
        />
        <StatCard
          label="Conteos pendientes"
          value={pendingCounts}
          hint="In progress + draft"
          icon={ScanBarcode}
        />
        <StatCard
          label="Caja actual"
          value={formatCurrency(6020)}
          hint="Esperado · sesión Rosa P."
          icon={Receipt}
        />
        <StatCard
          label="DGII"
          value="Inactivo"
          hint="Pendiente de certificado"
          icon={AlertTriangle}
          tone="warning"
        />
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
              href="/inventario/vencimientos"
              className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              Ver todos →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-black/5">
              {expiringSoon.map((lot) => {
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
            {lowStockProducts.map(({ p, stock }) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-amber-50/60 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs opacity-60">SKU {p.sku}</div>
                </div>
                <div className="flex flex-col items-end">
                  <Badge tone="warning">{stock} u.</Badge>
                  <span className="mt-1 text-[10px] opacity-50">
                    Mín {p.minStock}
                  </span>
                </div>
              </div>
            ))}
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
              {todayProformas.map((p) => (
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
              title="Nuevo conteo"
              description="Sesión de conteo móvil"
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
  status: (typeof mockProformas)[number]["status"];
}) {
  const map: Record<
    typeof status,
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
