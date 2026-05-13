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
} from "@/components/ui";
import { BarChart } from "@/components/ui/bar-chart";
import {
  getBrandById,
  mockProducts,
  totalStockForProduct,
} from "@/lib/mock-data/catalog";
import { mockProformas } from "@/lib/mock-data/sales";
import { formatCurrency } from "@/lib/utils/format";

export default function ReporteProductosPage() {
  // Ventas por producto
  const salesByProduct: Record<
    string,
    { name: string; qty: number; revenue: number; margin: number }
  > = {};
  mockProformas.forEach((p) =>
    p.items.forEach((i) => {
      const key = i.productId;
      if (!salesByProduct[key]) {
        salesByProduct[key] = { name: i.productName, qty: 0, revenue: 0, margin: 0 };
      }
      salesByProduct[key]!.qty += i.quantity;
      salesByProduct[key]!.revenue += i.total;
    }),
  );
  const top = Object.values(salesByProduct).sort((a, b) => b.revenue - a.revenue);

  const lowRotation = mockProducts
    .filter((p) => !salesByProduct[p.id])
    .map((p) => ({ p, stock: totalStockForProduct(p.id) }))
    .filter(({ stock }) => stock > 0)
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Reporte de productos"
        description="Más vendidos del día y productos con baja rotación."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Productos" }]}
      />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Más vendidos hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={top.map((t) => ({ label: t.name, value: t.revenue }))}
              formatter={formatCurrency}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Detalle de ventas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH className="text-right">Cant.</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {top.map((t, i) => (
                  <TR key={i}>
                    <TD className="text-sm">{t.name}</TD>
                    <TD className="text-right tabular-nums">{t.qty}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(t.revenue)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Baja rotación (sin venta hoy)</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Productos en stock que no se han vendido en el período. Considerar
            promociones o reducir reordenamiento.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Marca</TH>
                <TH className="text-right">Stock</TH>
              </TR>
            </THead>
            <TBody>
              {lowRotation.map(({ p, stock }) => (
                <TR key={p.id}>
                  <TD className="text-sm">{p.name}</TD>
                  <TD className="text-sm opacity-70">{getBrandById(p.brandId)?.name}</TD>
                  <TD className="text-right tabular-nums">{stock}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
