"use client";

import * as React from "react";

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
import { combinarDesglose, fundirTarjeta, TarjetaDesglose, type FilaTarjeta } from "./desglose-tarjetas";
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
  historicoCargando = false,
  historicoAviso = null,
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
  /** `true` mientras el TOTAL del histórico (el de los KPIs) está en camino. */
  historicoCargando?: boolean | undefined;
  /** Aviso del KPI cuando el histórico no participa por algo que hay que explicar. */
  historicoAviso?: string | null | undefined;
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
  const desgloseSucursal = useDesgloseVentas("sucursal", filtros, historicoParticipa);
  // La tendencia: el histórico migrado sí sabe agruparse por mes desde
  // `20260907120000`, así que esta gráfica deja de decir «Sin datos para el
  // rango» teniendo 44 meses de historia detrás.
  const desgloseMes = useDesgloseVentas("mes", filtros, historicoParticipa);
  // «Clientes principales» y «Comprobantes»: desde
  // `20260909150000_desglose_ventas_cliente_comprobante.sql` la base también
  // sabe agrupar el histórico migrado por estas dos dimensiones, así que
  // dejan de ser tarjetas SOLO del sistema (ver el porqué largo en
  // `desglose-tarjetas.tsx`).
  const desgloseCliente = useDesgloseVentas("cliente", filtros, historicoParticipa);
  const desgloseComprobante = useDesgloseVentas("comprobante", filtros, historicoParticipa);

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

  // 🔴 «TODO DEBE ESTAR UNIFICADO... NO DIVIDIR LOS PROCESOS Y LA INFORMACIÓN»
  // (pedido del dueño, 10/09/2026, con captura de pantalla: «Desteny Reynoso»
  // salía en DOS filas —19 ventas migradas, 2 del sistema— como si fueran dos
  // personas distintas). Es seguro fundirlas aquí porque la base ya unifica la
  // clave: una vendedora vinculada (`vincular-vendedores.mjs`) sale con el
  // MISMO `users.id` en las dos mitades (ver
  // `20260906140000_desglose_ventas_unificadas.sql`), así que `fundirTarjeta`
  // solo junta lo que de verdad es la misma persona — a un vendedor SIN
  // vincular (clave = nombre normalizado) no le inventa una fusión que no le
  // corresponde.
  const tarjetaVendedor = fundirTarjeta(
    combinarDesglose({
      sistema: vendedoresSistema,
      historicoParticipa,
      historicoCargando,
      historicoAviso,
      estado: desgloseVendedor,
    }),
  );
  const tarjetaPago = combinarDesglose({
    sistema: pagosSistema,
    historicoParticipa,
    historicoCargando,
    historicoAviso,
    estado: desglosePago,
    // Alegra guarda `cash`/`credit-card`; se traducen con el MISMO diccionario
    // que ya usa la tabla del histórico (`METODO_ETIQUETA`), no con uno nuevo.
    // La clave vacía se deja como vino: la base ya la resolvió a «Sin forma de
    // pago» (`ETIQUETA_SIN_FORMA_PAGO`); `METODO_ETIQUETA[""]` dice
    // «Sin método» y serían dos nombres para lo mismo.
    etiquetaMigrada: (f) => (f.clave ? (METODO_ETIQUETA[f.clave] ?? f.etiqueta) : f.etiqueta),
  });
  const sucursalesSistema: FilaTarjeta[] = report.branches.map((b) => ({
    // `byBranch` (sales-report.ts) usa el placeholder "—" cuando no hay
    // sucursal; la base usa "" (`coalesce(ai.branch_id::text, '')`). Se
    // normalizan a la MISMA clave vacía para que «Sin sucursal» —si algún día
    // existe una venta sin sede— caiga en una sola fila y no en dos.
    clave: b.id === "—" ? "" : b.id,
    etiqueta: b.name,
    origen: "sistema",
    cantidad: b.transactions,
    total: b.total,
  }));

  // 🔴 «LAS VENTAS Y PROCESO DE ALEGRA SALEN APARTE... HICE UNA VENTA Y SALE
  // LA SUC REPETIDA» (pedido del dueño, 10/09/2026, con captura: «DermaLand
  // Principal» salía en DOS filas —10 ventas migradas, 7 del sistema— como si
  // fueran dos sucursales). Se funden aquí, al revés que antes: la clave
  // migrada YA es `branches.id` (`alegra_invoices.branch_id` referencia
  // `public.branches`, ver `20260907120000_desglose_ventas_sucursal_mes.sql`),
  // el MISMO espacio que usa `sucursalesSistema` arriba — no hay ninguna
  // sucursal real que pueda fundirse por error con otra.
  const tarjetaSucursal = fundirTarjeta(
    combinarDesglose({
      sistema: sucursalesSistema,
      historicoParticipa,
      historicoCargando,
      historicoAviso,
      estado: desgloseSucursal,
    }),
  );

  // La mitad del sistema de «Clientes principales» y «Comprobantes» sale de
  // `report.customers`/`report.comprobantes` (topCustomers/byComprobante),
  // igual que las otras tarjetas: ese cálculo ya tiene TODOS los filtros del
  // reporte aplicados, cosa que el desglose de la base no sabe hacer.
  const clientesSistema: FilaTarjeta[] = report.customers.map((c) => ({
    clave: c.name,
    etiqueta: c.name,
    origen: "sistema",
    cantidad: c.purchases,
    total: c.total,
  }));
  const comprobantesSistema: FilaTarjeta[] = report.comprobantes.map((c) => ({
    clave: c.key,
    etiqueta: c.label,
    origen: "sistema",
    cantidad: c.count,
    total: c.total,
  }));

  // «Clientes principales» NO se funde: la mitad del sistema clava por NOMBRE
  // y la migrada por `alegra_invoices.client_id` (el contacto de Alegra, un
  // espacio de ids distinto) — dos clientes reales con el mismo nombre común
  // en RD fundirían sus compras en una sola fila, que es peor que la
  // separación actual. Fundir esto de verdad exige resolver identidad (p. ej.
  // por documento) entre las dos fuentes, no una coincidencia de texto.
  const tarjetaCliente = combinarDesglose({
    sistema: clientesSistema,
    historicoParticipa,
    historicoCargando,
    historicoAviso,
    estado: desgloseCliente,
  });
  // Comprobante SÍ se funde: las dos mitades ya comparten la MISMA clave
  // (`ComprobanteKey`: b02/b01/e32/e31/other — ver
  // `20260909150000_desglose_ventas_cliente_comprobante.sql`), así que un
  // «Factura de consumo (B02)» con ventas de las dos fuentes es una sola fila,
  // no dos.
  const tarjetaComprobante = fundirTarjeta(
    combinarDesglose({
      sistema: comprobantesSistema,
      historicoParticipa,
      historicoCargando,
      historicoAviso,
      estado: desgloseComprobante,
    }),
  );

  /**
   * La serie mensual, con las dos mitades sumadas por mes.
   *
   * `report.trend` viene ya etiquetado por el sistema; el desglose migrado trae
   * `clave` = `YYYY-MM` y `etiqueta` legible. Se juntan por etiqueta y se
   * ordenan por la clave, que es la que ordena bien como texto — «Sep 2026»
   * alfabéticamente iría antes que «Ago 2026».
   */
  const tendencia = React.useMemo(() => {
    const migrados =
      historicoParticipa && desgloseMes.tipo === "listo"
        ? desgloseMes.datos.filas.filter((f) => f.origen === "alegra")
        : [];
    if (migrados.length === 0) return report.trend;
    const porEtiqueta = new Map<string, { clave: string; value: number }>();
    for (const p of report.trend) {
      porEtiqueta.set(p.label, { clave: p.label, value: p.value });
    }
    for (const f of migrados) {
      const previo = porEtiqueta.get(f.etiqueta);
      porEtiqueta.set(f.etiqueta, {
        clave: f.clave,
        value: (previo?.value ?? 0) + f.total,
      });
    }
    return [...porEtiqueta.entries()]
      .sort((a, b) => a[1].clave.localeCompare(b[1].clave))
      .map(([label, v]) => ({ label, value: v.value }));
  }, [report.trend, desgloseMes, historicoParticipa]);

  // La tendencia comparte el mismo criterio de honestidad que las tablas: si
  // falta media serie —porque el KPI del histórico sigue en camino, porque hay
  // un filtro que no sabe aplicar, o porque la consulta falló— se dice.
  const tendenciaCargando = historicoCargando || (historicoParticipa && desgloseMes.tipo === "cargando");
  const tendenciaAviso =
    desgloseMes.tipo === "error" && historicoParticipa
      ? `${desgloseMes.mensaje} La gráfica enseña solo las ventas del sistema.`
      : (historicoAviso ?? null);

  const tarjetaProducto = combinarDesglose({
    sistema: productosSistema,
    historicoParticipa,
    historicoCargando,
    historicoAviso,
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
        </CardHeader>
        <CardContent>
          {/* 🔴 Una barra por mes con las DOS mitades sumadas, no dos series:
              son el mismo mes y los mismos filtros. Aquí sí se funden —al revés
              que en las tablas de al lado— porque el eje es el tiempo, no el
              origen, y una barra no puede llevar etiqueta. La leyenda de abajo
              dice cuántas ventas migradas entran en el total. */}
          {/* Mientras falta media serie se dice, igual que en las tablas: una
              gráfica a la que le falta el histórico y no avisa se lee como si
              el negocio hubiera vendido eso y nada más. */}
          {tendenciaCargando && (
            <p className="mb-2 text-sm opacity-60">Cargando el histórico migrado…</p>
          )}
          {tendenciaAviso && <p className="mb-2 text-sm text-amber-700">{tendenciaAviso}</p>}
          {tendencia.length ? (
            <BarChart data={tendencia} formatter={formatCurrency} />
          ) : (
            !tendenciaCargando && <p className="text-sm opacity-60">Sin datos para el rango.</p>
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
      {/* Era una gráfica solo-sistema, y como `proformas` está vacía decía
          «Sin datos.» justo donde aterriza el clic de la tarjeta homónima del
          panel: se salía de un dato bueno a una pantalla en blanco. Ahora
          cuenta las dos mitades, como las otras tres tablas de este bloque. */}
      <TarjetaDesglose
        titulo="Ventas por sucursal"
        estado={tarjetaSucursal}
        encabezadoClave="Sucursal"
        encabezadoCantidad="Ventas"
        vacio="Sin ventas en el rango."
      />
      {/* 🔴 CAJEROS, no vendedores — y la diferencia importa. El cajero es quien
          cobró en el punto de venta de DermaLand; las facturas migradas no
          pasaron por esa caja y NO tienen cajero, así que aquí no hay nada que
          sumarles. Los vendedores del histórico sí están, en su propia tarjeta
          más abajo. Se quitó «/ vendedores» del título porque prometía algo que
          esta tarjeta no puede dar y que la de al lado sí. */}
      <Card>
        <CardHeader>
          <CardTitle>Top cajeros</CardTitle>
        </CardHeader>
        <CardContent>
          {report.cashiers.length ? (
            <BarChart
              data={report.cashiers.map((c) => ({ label: c.name, value: c.total }))}
              formatter={formatCurrency}
            />
          ) : (
            <p className="text-sm opacity-60">
              Sin cobros en caja para el rango. Las facturas migradas de Alegra no pasaron por la
              caja de DermaLand; sus vendedores están en «Ventas por vendedor».
            </p>
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
      <TarjetaDesglose
        titulo="Clientes principales"
        estado={tarjetaCliente}
        encabezadoClave="Cliente"
        encabezadoCantidad="Compras"
        vacio="Sin clientes."
        tope={10}
      />
      <TarjetaDesglose
        titulo="Comprobantes"
        estado={tarjetaComprobante}
        encabezadoClave="Tipo"
        encabezadoCantidad="Cant."
        vacio="Sin comprobantes."
      />
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
