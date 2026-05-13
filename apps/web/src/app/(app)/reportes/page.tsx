import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart, Spark } from "@/components/ui/bar-chart";
import {
  BarChart3,
  Coins,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Download,
} from "lucide-react";
import { mockProformas } from "@/lib/mock-data/sales";
import { mockBrands } from "@/lib/mock-data/catalog";
import { formatCurrency } from "@/lib/utils/format";

export default function ReportesDashboard() {
  const totalSales = mockProformas.reduce((s, p) => s + p.total, 0);
  const itbis = mockProformas.reduce((s, p) => s + p.itbis, 0);
  const items = mockProformas.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  const salesByBrand = mockBrands
    .slice(0, 8)
    .map((b) => ({
      label: b.name,
      value: Math.round(b.productCount * 540 + Math.random() * 8000),
    }))
    .sort((a, b) => b.value - a.value);

  const last7Days = [12400, 8900, 14500, 19200, 11800, 21300, totalSales];

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Indicadores de operación. Exportables a CSV/PDF."
        breadcrumbs={[{ label: "Reportes" }]}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Exportar dashboard
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventas hoy" value={formatCurrency(totalSales)} icon={Coins} tone="primary" delta={{ value: 12.4 }} />
        <StatCard label="ITBIS recaudado" value={formatCurrency(itbis)} icon={TrendingUp} delta={{ value: 8.1 }} />
        <StatCard label="Items vendidos" value={items} icon={ShoppingCart} delta={{ value: 5.2 }} />
        <StatCard label="Clientes únicos" value={mockProformas.length} icon={Users} delta={{ value: -2.4 }} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tendencia 7 días</CardTitle>
          </CardHeader>
          <CardContent>
            <Spark values={last7Days} className="h-24" />
            <div className="mt-2 flex justify-between text-[10px] opacity-60">
              <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Hoy</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventas por marca</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={salesByBrand}
              formatter={(v) => formatCurrency(v)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ReportLink href="/reportes/ventas" title="Ventas" desc="Por día, sucursal, cajero, producto" icon={Coins} />
        <ReportLink href="/reportes/inventario" title="Inventario" desc="Stock, valor, vencimientos" icon={Package} />
        <ReportLink href="/reportes/caja" title="Caja" desc="Aperturas, cierres, diferencias" icon={Coins} />
        <ReportLink href="/reportes/clientes" title="Clientes" desc="Frecuentes, segmentación, deuda" icon={Users} />
        <ReportLink href="/reportes/conteos" title="Conteos físicos" desc="Diferencias, faltantes, sobrantes" icon={BarChart3} />
        <ReportLink href="/reportes/productos" title="Productos" desc="Más vendidos, baja rotación" icon={Package} />
      </div>
    </>
  );
}

function ReportLink({
  href,
  title,
  desc,
  icon: Icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 transition hover:border-[color:var(--brand-primary)]/40 hover:shadow-sm"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs opacity-60">{desc}</div>
      </div>
    </Link>
  );
}
