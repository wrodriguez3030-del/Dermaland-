"use client";

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
import { formatCurrency, formatDate } from "@/lib/utils/format";
import {
  comprobanteLabel,
  saleMethodSummary,
  saleStatusKey,
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
  type SalesReport,
} from "@/features/sales/sales-report";
import type { Proforma } from "@/types";

/**
 * 🔴 Aviso obligatorio de estas tarjetas: son SOLO del sistema.
 *
 * El resumen que da la base son dos números —total y cantidad—; no sabe
 * desglosar el histórico migrado por vendedor, producto, forma de pago ni
 * comprobante. Sin este aviso, el dueño lee arriba «Total facturado
 * RD$48 454 899,08 · 14 743 transacciones» y cuatro tarjetas más abajo
 * «Ventas por vendedor: sin ventas con vendedor», cuando `seller_name` tiene
 * DESTENY REYNOSO con 5 513 facturas y LAURA MEJIA con 1 027. Dos cifras que
 * no cuadran y nada que explique por qué es exactamente el desconcierto que
 * este plan vino a cerrar.
 */
function AvisoSoloSistema({ mostrar }: { mostrar: boolean }) {
  if (!mostrar) return null;
  return (
    <p className="mt-1 text-[11px] font-medium text-amber-700">
      Solo ventas del sistema — el histórico migrado de Alegra no se desglosa
      así todavía; su total está arriba y sus facturas, más abajo.
    </p>
  );
}

/**
 * Bloques de PRESENTACIÓN del reporte de ventas: las gráficas, los resúmenes
 * (vendedor, productos, clientes, comprobantes) y el detalle completo que solo
 * sale al imprimir.
 *
 * Salen de `page.tsx` porque ese archivo estaba muy por encima del máximo de
 * 800 líneas de la casa y este trabajo le añadía más. No cambian nada: son las
 * mismas tarjetas, con las mismas cifras, movidas tal cual. Todo lo que
 * necesitan llega por props; no piden datos ni guardan estado.
 *
 * Ojo: estos bloques son SOLO del sistema. El histórico migrado de Alegra se
 * enseña aparte (`historico-alegra.tsx`) porque la base da su total y sus
 * facturas, no su desglose por producto ni por comprobante.
 */

/** Gráficas y tablas de resumen del reporte (todas sobre `report`). */
export function ResumenesVentas({
  report,
  soloSistema,
}: {
  report: SalesReport;
  /** `true` cuando el histórico SÍ entra en los KPIs de arriba y estas tarjetas no. */
  soloSistema: boolean;
}) {
  return (
    <>
    {/* ── Gráficas / resúmenes ── */}
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tendencia de ventas</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent>
          {report.trend.length ? (
            <BarChart data={report.trend} formatter={formatCurrency} />
          ) : (
            <p className="text-sm opacity-60">Sin datos para el rango.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Medios de pago</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent>
          <BarChart
            data={report.methods.map((m) => ({ label: m.label, value: m.amount }))}
            formatter={formatCurrency}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ventas por sucursal</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent>
          {report.branches.length ? (
            <BarChart
              data={report.branches.map((b) => ({ label: b.name, value: b.total }))}
              formatter={formatCurrency}
            />
          ) : (
            <p className="text-sm opacity-60">Sin datos.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Top cajeros / vendedores</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent>
          {report.cashiers.length ? (
            <BarChart
              data={report.cashiers.map((c) => ({ label: c.name, value: c.total }))}
              formatter={formatCurrency}
            />
          ) : (
            <p className="text-sm opacity-60">Sin datos.</p>
          )}
        </CardContent>
      </Card>
    </div>

    {/* ── Ventas por vendedor (base de incentivos) ── */}
    <div className="mb-6">
      <Card>
        <CardHeader>
          <CardTitle>Ventas por vendedor</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Vendedor</TH>
                <TH className="text-right">Ventas</TH>
                <TH className="text-right">Total vendido</TH>
                <TH className="text-right">Ticket promedio</TH>
              </TR>
            </THead>
            <TBody>
              {report.sellers.map((s) => (
                <TR key={s.id}>
                  <TD className="text-sm">{s.name}</TD>
                  <TD className="text-right tabular-nums">{s.transactions}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(s.total)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatCurrency(
                      s.transactions ? s.total / s.transactions : 0,
                    )}
                  </TD>
                </TR>
              ))}
              {!report.sellers.length && (
                <TR>
                  <TD colSpan={4} className="py-6 text-center text-sm opacity-60">
                    Sin ventas con vendedor.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <div className="mb-6 grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Productos más vendidos</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Monto</TH>
              </TR>
            </THead>
            <TBody>
              {report.products.slice(0, 10).map((p) => (
                <TR key={p.productId}>
                  <TD className="text-sm">{p.name}</TD>
                  <TD className="text-right tabular-nums">{p.quantity}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(p.total)}</TD>
                </TR>
              ))}
              {!report.products.length && (
                <TR>
                  <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                    Sin productos.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clientes principales</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH className="text-right">Compras</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {report.customers.slice(0, 10).map((c, i) => (
                <TR key={`${c.name}-${i}`}>
                  <TD className="text-sm">{c.name}</TD>
                  <TD className="text-right tabular-nums">{c.purchases}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(c.total)}</TD>
                </TR>
              ))}
              {!report.customers.length && (
                <TR>
                  <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                    Sin clientes.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Comprobantes</CardTitle>
          <AvisoSoloSistema mostrar={soloSistema} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {report.comprobantes.map((c) => (
                <TR key={c.key}>
                  <TD className="text-sm">{c.label}</TD>
                  <TD className="text-right tabular-nums">{c.count}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(c.total)}</TD>
                </TR>
              ))}
              {!report.comprobantes.length && (
                <TR>
                  <TD colSpan={3} className="py-6 text-center text-sm opacity-60">
                    Sin comprobantes.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </>
  );
}

/**
 * Detalle completo para impresión / PDF: TODOS los resultados filtrados, no
 * solo la página visible en pantalla.
 */
export function DetalleImpresionVentas({
  sorted,
  branchNames,
}: {
  sorted: Proforma[];
  branchNames: Map<string, string>;
}) {
  return (
    <div className="print-only">
      <Card>
        <CardHeader>
          <CardTitle>Detalle de ventas ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Sucursal</TH>
                <TH>Comprobante</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH>Cajero</TH>
                <TH className="text-right">Items</TH>
                <TH>Método</TH>
                <TH className="text-right">ITBIS</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((p) => {
                const status = saleStatusKey(p.status);
                const method = saleMethodSummary(p);
                const items = p.items.reduce((q, it) => q + it.quantity, 0);
                return (
                  <TR key={`print-${p.id}`}>
                    <TD className="text-xs">{formatDate(p.createdAt)}</TD>
                    <TD className="text-xs">{branchNames.get(p.branchId) ?? "Sucursal"}</TD>
                    <TD className="font-mono text-xs">{p.ecfNumber ?? p.number}</TD>
                    <TD className="text-xs">{comprobanteLabel(p)}</TD>
                    <TD className="text-xs">{p.customerName || "Consumidor final"}</TD>
                    <TD className="text-xs">{p.cashierName || "—"}</TD>
                    <TD className="text-right tabular-nums text-xs">{items}</TD>
                    <TD className="text-xs">{SALE_METHOD_LABEL[method]}</TD>
                    <TD className="text-right tabular-nums text-xs">{formatCurrency(p.itbis)}</TD>
                    <TD className="text-right tabular-nums text-xs font-medium">{formatCurrency(p.total)}</TD>
                    <TD className="text-xs">{SALE_STATUS_LABEL[status]}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
