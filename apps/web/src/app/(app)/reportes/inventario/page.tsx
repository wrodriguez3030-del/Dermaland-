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
  Badge,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { Boxes, AlertTriangle, ShieldAlert, Download } from "lucide-react";
import {
  mockProductLots,
  mockProducts,
  totalStockForProduct,
  getProductById,
  getBrandById,
} from "@/lib/mock-data/catalog";
import { formatCurrency, daysUntil, formatDate } from "@/lib/utils/format";

export default function ReporteInventarioPage() {
  const totalUnits = mockProductLots
    .filter((l) => l.status === "available")
    .reduce((s, l) => s + l.currentQuantity, 0);
  const totalValue = mockProductLots
    .filter((l) => l.status === "available")
    .reduce((s, l) => s + l.currentQuantity * l.unitCost, 0);
  const expired = mockProductLots.filter((l) => daysUntil(l.expiresAt) < 0).length;
  const lt90 = mockProductLots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 0 && d < 90;
  }).length;

  const valueByBrand = mockProducts
    .reduce(
      (acc, p) => {
        const brand = getBrandById(p.brandId);
        if (!brand) return acc;
        const v = mockProductLots
          .filter((l) => l.productId === p.id && l.status === "available")
          .reduce((s, l) => s + l.currentQuantity * l.unitCost, 0);
        acc[brand.name] = (acc[brand.name] ?? 0) + v;
        return acc;
      },
      {} as Record<string, number>,
    );

  const topByValue = Object.entries(valueByBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  return (
    <>
      <PageHeader
        title="Reporte de inventario"
        description="Stock total, valor por marca, vencimientos próximos."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Inventario" }]}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unidades" value={totalUnits} icon={Boxes} tone="primary" />
        <StatCard label="Valor inventario" value={formatCurrency(totalValue)} icon={Boxes} />
        <StatCard label="Lotes vencidos" value={expired} icon={ShieldAlert} tone="danger" />
        <StatCard label="Próximos < 90 días" value={lt90} icon={AlertTriangle} tone="warning" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Valor de inventario por marca</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={topByValue} formatter={formatCurrency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vencimientos próximos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Vence</TH>
                <TH>Días</TH>
                <TH className="text-right">Cantidad</TH>
                <TH className="text-right">Valor</TH>
              </TR>
            </THead>
            <TBody>
              {[...mockProductLots]
                .sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt))
                .slice(0, 10)
                .map((lot) => {
                  const p = getProductById(lot.productId);
                  const days = daysUntil(lot.expiresAt);
                  return (
                    <TR key={lot.id}>
                      <TD className="text-sm">{p?.name}</TD>
                      <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                      <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                      <TD>
                        <Badge tone={days < 0 ? "danger" : days < 30 ? "danger" : days < 90 ? "warning" : "neutral"}>
                          {days < 0 ? `${Math.abs(days)}d venc.` : `${days}d`}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{lot.currentQuantity}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(lot.currentQuantity * lot.unitCost)}</TD>
                    </TR>
                  );
                })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
