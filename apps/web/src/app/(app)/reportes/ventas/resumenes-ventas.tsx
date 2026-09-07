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
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";
import {
  comprobanteLabel,
  saleMethodSummary,
  saleStatusKey,
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
  type SalesReport,
} from "@/features/sales/sales-report";
import { METODO_ETIQUETA } from "@/features/alegra/sales-report";
import { useDesgloseVentas } from "@/features/ventas/ventas-api";
import {
  AvisoSoloSistema,
  combinarDesglose,
  TarjetaDesglose,
  type FilaTarjeta,
} from "./desglose-tarjetas";
import type { Proforma } from "@/types";

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
 * Ojo: TRES de estas tarjetas —vendedor, forma de pago y producto— sí llevan
 * el histórico migrado, porque la base sabe agruparlo (migración
 * `20260906140000_desglose_ventas_unificadas.sql`) y cada fila enseña su
 * origen. Las demás siguen siendo solo del sistema y lo dicen: la base no sabe
 * desglosar el histórico por sucursal, cajero, cliente ni comprobante.
 */

/** Gráficas y tablas de resumen del reporte. */
export function ResumenesVentas({
  report,
  historicoParticipa,
  desde,
  hasta,
  sucursalId,
}: {
  report: SalesReport;
  /**
   * `true` cuando el histórico migrado SÍ entra en los KPIs de arriba — es
   * decir, cuando la casilla está marcada y no hay ningún filtro que el
   * histórico no sepa aplicar. Es lo que decide si estas tarjetas lo piden y
   * si las que no saben desglosarlo tienen que avisar de que se quedan cortas.
   */
  historicoParticipa: boolean;
  /** Los tres filtros que el histórico sabe aplicar. `YYYY-MM-DD` los dos primeros. */
  desde?: string | undefined;
  hasta?: string | undefined;
  sucursalId?: string | undefined;
}) {
  // Un desglose por tarjeta: tres consultas de agregado, decenas de bytes cada
  // una. Ninguna descarga filas para contarlas.
  const filtros = { desde, hasta, sucursalId };
  const desgloseVendedor = useDesgloseVentas("vendedor", filtros, historicoParticipa);
  const desglosePago = useDesgloseVentas("forma_pago", filtros, historicoParticipa);
  const desgloseProducto = useDesgloseVentas("producto", filtros, historicoParticipa);

  // La mitad del sistema sale del reporte ya filtrado (ver el porqué en
  // `desglose-tarjetas.tsx`), no de la base.
  const vendedoresSistema: FilaTarjeta[] = report.sellers.map((s) => ({
    clave: s.id,
    etiqueta: s.name,
    origen: "sistema",
    cantidad: s.transactions,
    total: s.total,
  }));
  const pagosSistema: FilaTarjeta[] = report.methods
    // `byPaymentMethod` devuelve SIEMPRE los cuatro grupos, con ceros incluidos:
    // en una gráfica de barras eso era una barra a cero, pero en una tabla son
    // cuatro filas vacías al pie del desglose migrado. Un grupo sin nada dentro
    // no es información.
    .filter((m) => m.sales > 0 || m.amount !== 0)
    .map((m) => ({
      clave: m.key,
      etiqueta: m.label,
      origen: "sistema",
      // `sales` (ventas distintas), no `count` (líneas de pago): una venta con
      // pago mixto tiene dos líneas y sigue siendo UNA venta, que es lo que
      // cuenta la columna de al lado en las filas migradas.
      cantidad: m.sales,
      total: m.amount,
    }));
  const productosSistema: FilaTarjeta[] = report.products.map((p) => ({
    clave: p.productId,
    etiqueta: p.name,
    origen: "sistema",
    cantidad: p.quantity,
    total: p.total,
  }));

  const tarjetaVendedor = combinarDesglose({
    sistema: vendedoresSistema,
    historicoParticipa,
    estado: desgloseVendedor,
  });
  const tarjetaPago = combinarDesglose({
    sistema: pagosSistema,
    historicoParticipa,
    estado: desglosePago,
    // Alegra guarda `cash`/`credit-card`; se traducen con el MISMO diccionario
    // que ya usa la tabla del histórico (`METODO_ETIQUETA`), no con uno nuevo.
    // La clave vacía se deja como vino: la base ya la resolvió a «Sin forma de
    // pago», que es el texto de `agregados.ts`; `METODO_ETIQUETA[""]` dice
    // «Sin método» y serían dos nombres para lo mismo.
    etiquetaMigrada: (f) => (f.clave ? (METODO_ETIQUETA[f.clave] ?? f.etiqueta) : f.etiqueta),
  });
  const tarjetaProducto = combinarDesglose({
    sistema: productosSistema,
    historicoParticipa,
    estado: desgloseProducto,
  });

  // 🔴 El dato migrado, sin maquillar: Alegra no registró la forma de pago en
  // 12 672 de las 14 743 facturas que cuentan. «Sin forma de pago» va a
  // dominar el desglose y eso NO es un fallo; decirlo evita que parezca uno.
  const sinFormaDePago = tarjetaPago.filas.find(
    (f) => f.origen === "alegra" && f.clave === "",
  );
  // 🔴 Y la otra media verdad de esa misma tabla: la columna «Total» NO mide
  // lo mismo en las dos mitades. En las filas migradas es el total de la
  // FACTURA; en las del sistema, la suma de los PAGOS RECIBIDOS
  // (`byPaymentMethod` acumula `pay.amount`), que en una venta a crédito o
  // pagada a medias no es lo facturado. Hoy `proformas` está vacía y la
  // columna suma exactamente el KPI, así que quien la lea aprenderá que
  // cuadra; el día que haya ventas del sistema dejará de cuadrar. Se dice
  // cuando hay filas del sistema, que es cuando importa.
  const hayPagosDelSistema = tarjetaPago.filas.some((f) => f.origen === "sistema");
  const notasPago = [
    sinFormaDePago
      ? `Alegra no registró la forma de pago en ${formatNumber(sinFormaDePago.cantidad)} de las ` +
        "facturas migradas: por eso «Sin forma de pago» encabeza la lista. Es el dato tal como " +
        "vino de la migración, no un fallo."
      : null,
    hayPagosDelSistema
      ? "En las filas del sistema el total son los pagos RECIBIDOS; en las migradas, el total " +
        "facturado. Las dos columnas no se pueden sumar como si midieran lo mismo."
      : null,
  ].filter((n): n is string => n !== null);

  return (
    <>
    {/* ── Gráficas / resúmenes ── */}
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tendencia de ventas</CardTitle>
          <AvisoSoloSistema mostrar={historicoParticipa} />
        </CardHeader>
        <CardContent>
          {report.trend.length ? (
            <BarChart data={report.trend} formatter={formatCurrency} />
          ) : (
            <p className="text-sm opacity-60">Sin datos para el rango.</p>
          )}
        </CardContent>
      </Card>
      {/* Era una gráfica de barras. Pasa a tabla porque una barra no puede
          llevar la etiqueta de origen de su fila, y sin ella el histórico
          migrado y las ventas del sistema se confundirían en el mismo dibujo. */}
      <TarjetaDesglose
        titulo="Medios de pago"
        estado={tarjetaPago}
        encabezadoClave="Forma de pago"
        encabezadoCantidad="Ventas"
        vacio="Sin pagos registrados."
        nota={notasPago.length ? notasPago.join(" ") : undefined}
      />
      <Card>
        <CardHeader>
          <CardTitle>Ventas por sucursal</CardTitle>
          <AvisoSoloSistema mostrar={historicoParticipa} />
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
          <AvisoSoloSistema mostrar={historicoParticipa} />
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
      <TarjetaDesglose
        titulo="Ventas por vendedor"
        estado={tarjetaVendedor}
        encabezadoClave="Vendedor"
        encabezadoCantidad="Ventas"
        vacio="Sin ventas con vendedor."
        mostrarPromedio
      />
    </div>

    <div className="mb-6 grid gap-6 lg:grid-cols-3">
      <TarjetaDesglose
        titulo="Productos más vendidos"
        estado={tarjetaProducto}
        encabezadoClave="Producto"
        encabezadoCantidad="Cant."
        vacio="Sin productos."
        tope={10}
        nota={
          tarjetaProducto.filas.some((f) => f.origen === "alegra")
            ? `Los 10 de mayor importe de ${formatNumber(tarjetaProducto.filas.length)} que se ` +
              "reciben, y la base manda como mucho 200 grupos de un catálogo migrado de 1 248 " +
              "productos: es un ranking, no un total. «Cant.» son unidades en las ventas del " +
              "sistema y renglones de factura en las migradas: el histórico de Alegra no trae la " +
              "unidad con la precisión que hace falta para sumarla."
            : undefined
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Clientes principales</CardTitle>
          <AvisoSoloSistema mostrar={historicoParticipa} />
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
          <AvisoSoloSistema mostrar={historicoParticipa} />
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
