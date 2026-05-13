import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { Users, TrendingUp, Star } from "lucide-react";
import { mockCustomers } from "@/lib/mock-data/customers";
import { formatCurrency, relativeTime } from "@/lib/utils/format";

export default function ReporteClientesPage() {
  const top = [...mockCustomers]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 8);

  const tagCount: Record<string, number> = {};
  mockCustomers.forEach((c) => c.tags.forEach((t) => (tagCount[t] = (tagCount[t] ?? 0) + 1)));
  const segmentation = Object.entries(tagCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const totalSpent = mockCustomers.reduce((s, c) => s + c.totalSpent, 0);
  const avgTicket = totalSpent / mockCustomers.reduce((s, c) => s + c.totalOrders, 0);

  return (
    <>
      <PageHeader
        title="Reporte de clientes"
        description="Frecuentes, segmentación, ticket promedio."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Clientes" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes activos" value={mockCustomers.length} icon={Users} tone="primary" />
        <StatCard label="Spend total acumulado" value={formatCurrency(totalSpent)} icon={TrendingUp} />
        <StatCard label="Ticket promedio" value={formatCurrency(avgTicket)} icon={TrendingUp} />
        <StatCard label="Clientes VIP" value={mockCustomers.filter((c) => c.tags.includes("VIP")).length} icon={Star} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top clientes por gasto</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Compras</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Última visita</TH>
                </TR>
              </THead>
              <TBody>
                {top.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="text-sm font-medium">{c.firstName} {c.lastName}</div>
                      <div className="text-xs opacity-60 font-mono">{c.customerNumber}</div>
                    </TD>
                    <TD className="text-right tabular-nums">{c.totalOrders}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatCurrency(c.totalSpent)}</TD>
                    <TD className="text-xs opacity-70">
                      {c.lastVisitAt ? relativeTime(c.lastVisitAt) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segmentación por tag</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={segmentation} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
