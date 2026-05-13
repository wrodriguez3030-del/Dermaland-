import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { Coins, Download, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { mockProformas } from "@/lib/mock-data/sales";
import { mockUsers } from "@/lib/mock-data/users";
import { formatCurrency } from "@/lib/utils/format";

export default function ReporteVentasPage() {
  const totalSales = mockProformas.reduce((s, p) => s + p.total, 0);
  const itbis = mockProformas.reduce((s, p) => s + p.itbis, 0);
  const items = mockProformas.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  const byCashier = mockUsers
    .filter((u) => u.role === "cashier")
    .map((u) => ({
      label: u.fullName,
      value: mockProformas
        .filter((p) => p.cashierId === u.id)
        .reduce((s, p) => s + p.total, 0),
    }));

  const byMethod = mockProformas
    .flatMap((p) => p.payments)
    .reduce(
      (acc, pay) => {
        acc[pay.method] = (acc[pay.method] ?? 0) + pay.amount;
        return acc;
      },
      {} as Record<string, number>,
    );

  return (
    <>
      <PageHeader
        title="Reporte de ventas"
        description="Ventas del día con desgloses por cajero, método de pago y categoría."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Ventas" }]}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={formatCurrency(totalSales)} icon={Coins} tone="primary" />
        <StatCard label="ITBIS" value={formatCurrency(itbis)} icon={TrendingUp} />
        <StatCard label="Transacciones" value={mockProformas.length} icon={Receipt} />
        <StatCard label="Items" value={items} icon={ShoppingCart} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por cajero</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={byCashier} formatter={formatCurrency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por método de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={Object.entries(byMethod).map(([k, v]) => ({
                label: k,
                value: v,
              }))}
              formatter={formatCurrency}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de proformas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Proforma</TH>
                <TH>Cliente</TH>
                <TH>Cajero</TH>
                <TH className="text-right">Subtotal</TH>
                <TH className="text-right">ITBIS</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {mockProformas.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.number}</TD>
                  <TD className="text-sm">{p.customerName}</TD>
                  <TD className="text-sm">{p.cashierName}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(p.subtotal)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(p.itbis)}</TD>
                  <TD className="text-right tabular-nums font-medium">{formatCurrency(p.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
