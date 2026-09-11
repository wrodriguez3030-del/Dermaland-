"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { EtiquetaOrigenes } from "@/features/ventas/etiqueta-origen";
import type { OrigenVenta } from "@/features/ventas/venta-unificada";
import type { EstadoTarjeta, EstadoTarjetaFundida, FilaTarjeta, FilaPanel } from "@/features/ventas/desglose-tarjeta";

/**
 * Las tarjetas del reporte de ventas que SÍ saben desglosar el histórico
 * migrado: vendedor, forma de pago y producto.
 *
 * Antes decían «Solo ventas del sistema» porque la base sólo sabía dar dos
 * números (total y cantidad). Desde la migración
 * `20260906140000_desglose_ventas_unificadas.sql` sabe agrupar, así que estas
 * tres tarjetas enseñan las dos fuentes y cada fila lleva su origen.
 *
 * 🔴 De dónde sale cada mitad, y por qué NO se toma entera del desglose:
 *
 *  - Las filas del SISTEMA salen del `SalesReport` que ya calcula la pantalla,
 *    porque ése aplica TODOS los filtros del reporte (método, comprobante,
 *    estado, cajero, vendedor, cliente, producto, «incluir proformas»). El
 *    desglose de la base sólo sabe filtrar por fecha, sucursal y cliente:
 *    usar su mitad «sistema» enseñaría, en la misma tabla, una fila filtrada
 *    por «Efectivo» y otra sin filtrar. Es la misma regla que ya sigue el KPI
 *    de arriba, que suma `k.totalBilled` (del reporte) con `historico.total`
 *    (de la base) y nunca `sistema_total`.
 *  - Las filas de ALEGRA salen del desglose, que es lo único que las sabe
 *    contar sin descargar 14 965 facturas.
 *
 * Y por eso el histórico sólo entra cuando `historicoParticipa` es `true`: ese
 * flag ya significa «no hay ningún filtro activo que el histórico no sepa
 * aplicar» (ver `filtrosDelReporteSinHistorico` en `historico-alegra.tsx`).
 * Cuando es `false`, la tarjeta se queda como estaba y lo DICE.
 */

/**
 * La combinación de las dos mitades vive en el modelo compartido
 * (`features/ventas/desglose-tarjeta.ts`) desde que el panel necesitó la misma
 * regla: dos copias se habrían separado, y decidir si se avisa al usuario no
 * puede depender de qué pantalla lo pinte. Se reexporta para que quien ya
 * importaba desde aquí no tenga que cambiar.
 */
export {
  combinarDesglose,
  fundirTarjeta,
  type EstadoTarjeta,
  type EstadoTarjetaFundida,
  type FilaTarjeta,
} from "@/features/ventas/desglose-tarjeta";

/** Fila del origen que sea: la suelta de `combinarDesglose` o la ya fundida. */
function origenesDeFila(f: FilaTarjeta | FilaPanel): readonly OrigenVenta[] {
  return "origenes" in f ? f.origenes : [f.origen];
}

/**
 * 🔴 Aviso de las tarjetas que todavía son SOLO del sistema.
 *
 * Sin él, el dueño lee arriba «Total facturado RD$48 454 899,08 · 14 743
 * transacciones» y más abajo una tarjeta que cuenta otra cosa. Dos cifras que
 * no cuadran y nada que explique por qué es exactamente el desconcierto que
 * este plan vino a cerrar.
 */
export function AvisoSoloSistema({ mostrar }: { mostrar: boolean }) {
  if (!mostrar) return null;
  return (
    <p className="mt-1 text-[11px] font-medium text-amber-700">
      Solo ventas del sistema — el histórico migrado de Alegra no se desglosa
      así todavía; su total está arriba y sus facturas, más abajo.
    </p>
  );
}

/** Una tarjeta de desglose: cabecera con sus avisos y la tabla de filas. */
export function TarjetaDesglose({
  titulo,
  estado,
  encabezadoClave,
  encabezadoCantidad,
  vacio,
  /** Nota permanente bajo la tabla (p. ej. qué significa «Cant.» en cada origen). */
  nota,
  /** Columna «Ticket promedio». Solo tiene sentido cuando la cantidad son ventas. */
  mostrarPromedio = false,
  /** Cuántas filas se pintan. El resto sigue contando en el total de arriba. */
  tope,
}: {
  titulo: string;
  /** Sueltas (`combinarDesglose`) o ya fundidas por clave (`fundirTarjeta`). */
  estado: EstadoTarjeta | EstadoTarjetaFundida;
  encabezadoClave: string;
  encabezadoCantidad: string;
  vacio: string;
  nota?: string | undefined;
  mostrarPromedio?: boolean;
  tope?: number | undefined;
}) {
  const filas = tope == null ? estado.filas : estado.filas.slice(0, tope);
  const columnas = mostrarPromedio ? 5 : 4;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <AvisoSoloSistema mostrar={estado.soloSistema && !estado.cargando && !estado.error} />
        {estado.cargando && (
          <p className="mt-1 text-[11px] opacity-60">Cargando el histórico migrado de Alegra…</p>
        )}
        {estado.error && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {estado.error}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>{encabezadoClave}</TH>
              <TH className="text-right">{encabezadoCantidad}</TH>
              <TH className="text-right">Total</TH>
              {mostrarPromedio && <TH className="text-right">Ticket promedio</TH>}
              <TH className="pr-4">Origen</TH>
            </TR>
          </THead>
          <TBody>
            {filas.map((f) => {
              const origenes = origenesDeFila(f);
              return (
                <TR key={`${origenes.join(",")}-${f.clave}-${f.etiqueta}`}>
                  <TD className="text-sm">{f.etiqueta}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(f.cantidad)}</TD>
                  <TD className="text-right tabular-nums font-medium">{formatCurrency(f.total)}</TD>
                  {mostrarPromedio && (
                    <TD className="text-right tabular-nums">
                      {formatCurrency(f.cantidad ? f.total / f.cantidad : 0)}
                    </TD>
                  )}
                  <TD className="pr-4">
                    <EtiquetaOrigenes origenes={origenes} />
                  </TD>
                </TR>
              );
            })}
            {filas.length === 0 && (
              <TR>
                <TD colSpan={columnas} className="py-6 text-center text-sm opacity-60">
                  {vacio}
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
        {nota && <p className="border-t px-4 py-2 text-[11px] opacity-60">{nota}</p>}
      </CardContent>
    </Card>
  );
}
