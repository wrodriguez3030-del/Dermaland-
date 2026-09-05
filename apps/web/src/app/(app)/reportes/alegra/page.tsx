import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/utils/format";
import { getRepoContext } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { facturasEnRango, lineasDeFacturas } from "@/server/services/alegra/queries";
import {
  productosVendidos,
  totalesDeVentas,
  ventasPorDia,
  ventasPorMetodo,
  ventasPorVendedor,
} from "@/features/alegra/sales-report";

export const dynamic = "force-dynamic";

/** Fecha de hoy en calendario dominicano, no UTC. */
function hoyRD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}
function menosDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReporteAlegraPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyRD();
  const hasta = ES_FECHA.test(q.hasta ?? "") ? q.hasta! : hoy;
  const desde = ES_FECHA.test(q.desde ?? "") ? q.desde! : menosDias(hasta, 29);
  const sucursal = q.sucursal || "";

  if (env.DATA_SOURCE !== "supabase") {
    return (
      <>
        <PageHeader title="Ventas en Alegra" breadcrumbs={[{ label: "Reportes" }, { label: "Ventas en Alegra" }]} />
        <Card>
          <CardContent className="py-12 text-center text-sm opacity-60">
            Este reporte lee el historial de Alegra, que necesita Supabase.
          </CardContent>
        </Card>
      </>
    );
  }

  const ctx = await getRepoContext();
  const [facturas, sucursales] = await Promise.all([
    facturasEnRango(ctx, desde, hasta, sucursal || undefined),
    getRepositories().branch.list(ctx),
  ]);
  const lineas = await lineasDeFacturas(
    ctx,
    facturas.map((f) => f.id),
  );

  const totales = totalesDeVentas(facturas);
  const porDia = ventasPorDia(facturas);
  const porVendedor = ventasPorVendedor(facturas);
  const porMetodo = ventasPorMetodo(facturas);
  const productos = productosVendidos(facturas, lineas, 20);
  const nombreSucursal = (id: string | null): string =>
    sucursales.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Ventas en Alegra"
        description="Historial de facturación de Alegra. No incluye proformas ni ventas del POS de DermaLand."
        breadcrumbs={[{ label: "Reportes" }, { label: "Ventas en Alegra" }]}
      />

      <Card className="mb-4">
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" name="desde" type="date" defaultValue={desde} />
            </div>
            <div>
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={hasta} />
            </div>
            <div>
              <Label htmlFor="sucursal">Sucursal</Label>
              <Select id="sucursal" name="sucursal" defaultValue={sucursal}>
                <option value="">Todas</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Ver</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Facturas" value={totales.facturas.toLocaleString("es-DO")} hint={`${totales.anuladas} anuladas`} />
        <StatCard label="Vendido" value={formatCurrency(totales.total)} />
        <StatCard label="Cobrado" value={formatCurrency(totales.cobrado)} />
        <StatCard label="Pendiente" value={formatCurrency(totales.saldo)} tone={totales.saldo > 0 ? "warning" : "default"} />
        <StatCard label="ITBIS" value={formatCurrency(totales.itbis)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por vendedor</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Vendedor</TH>
                  <TH className="text-right">Facturas</TH>
                  <TH className="text-right pr-4">Total</TH>
                </TR>
              </THead>
              <TBody>
                {porVendedor.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="py-8 text-center text-sm opacity-60">
                      Sin ventas en este rango.
                    </TD>
                  </TR>
                )}
                {porVendedor.map((g) => (
                  <TR key={g.clave}>
                    <TD>{g.etiqueta}</TD>
                    <TD className="text-right tabular-nums">{g.facturas}</TD>
                    <TD className="text-right tabular-nums pr-4">{formatCurrency(g.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por forma de pago</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Forma de pago</TH>
                  <TH className="text-right">Facturas</TH>
                  <TH className="text-right pr-4">Total</TH>
                </TR>
              </THead>
              <TBody>
                {porMetodo.map((g) => (
                  <TR key={g.clave}>
                    <TD>{g.etiqueta}</TD>
                    <TD className="text-right tabular-nums">{g.facturas}</TD>
                    <TD className="text-right tabular-nums pr-4">{formatCurrency(g.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH className="text-right">Unidades</TH>
                  <TH className="text-right pr-4">Total</TH>
                </TR>
              </THead>
              <TBody>
                {productos.map((p) => (
                  <TR key={p.productId ?? p.name}>
                    <TD className="text-sm">{p.name}</TD>
                    <TD className="text-right tabular-nums">{p.unidades}</TD>
                    <TD className="text-right tabular-nums pr-4">{formatCurrency(p.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Día a día</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] overflow-y-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH className="text-right">Facturas</TH>
                  <TH className="text-right pr-4">Total</TH>
                </TR>
              </THead>
              <TBody>
                {porDia.map((g) => (
                  <TR key={g.clave}>
                    <TD className="text-xs">{g.etiqueta}</TD>
                    <TD className="text-right tabular-nums">{g.facturas}</TD>
                    <TD className="text-right tabular-nums pr-4">{formatCurrency(g.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {sucursal && (
        <p className="mt-3 text-xs opacity-60">Filtrado por la sucursal {nombreSucursal(sucursal)}.</p>
      )}
    </>
  );
}
