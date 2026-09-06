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
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import type { EstadoVentas } from "@/features/ventas/ventas-api";
import type { FilaDesglose, OrigenVenta } from "@/features/ventas/venta-unificada";

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

export interface FilaTarjeta {
  clave: string;
  etiqueta: string;
  origen: OrigenVenta;
  /** Ventas del grupo. En «Productos más vendidos» las del sistema son unidades y las migradas, renglones. */
  cantidad: number;
  total: number;
}

export interface EstadoTarjeta {
  filas: FilaTarjeta[];
  /** `true` mientras el histórico está en camino: falta media tabla y hay que decirlo. */
  cargando: boolean;
  /** Mensaje de fallo visible, o `null`. Nunca se enseñan ceros en su lugar. */
  error: string | null;
  /** `true` si esta tarjeta sigue siendo SOLO del sistema y el aviso tiene que quedarse. */
  soloSistema: boolean;
}

/**
 * Junta la mitad del sistema con la mitad migrada y decide qué se le dice al
 * usuario. PURA a propósito: aquí vive la regla que impide enseñar media tabla
 * como si fuera entera, y una regla así se prueba, no se confía a la vista.
 */
export function combinarDesglose(entrada: {
  /** Filas del sistema, ya filtradas por el reporte. */
  sistema: FilaTarjeta[];
  /** `true` cuando el histórico participa en los KPIs (y por tanto puede participar aquí). */
  historicoParticipa: boolean;
  /** Estado de la petición del desglose. */
  estado: EstadoVentas<FilaDesglose[]>;
}): EstadoTarjeta {
  const { sistema, historicoParticipa, estado } = entrada;

  // El histórico no entra en ninguna parte de la pantalla: arriba y aquí
  // cuentan lo mismo, así que no hay nada que aclarar.
  if (!historicoParticipa) {
    return { filas: sistema, cargando: false, error: null, soloSistema: false };
  }
  // Todavía en camino: se enseña lo del sistema, pero DICIENDO que falta la
  // otra mitad. Un total provisional sin avisar es justo lo que hizo creer que
  // los datos no se habían migrado.
  if (estado.tipo === "cargando") {
    return { filas: sistema, cargando: true, error: null, soloSistema: true };
  }
  // Falló: se avisa. Enseñar la mitad del sistema en silencio la haría pasar
  // por el total.
  if (estado.tipo === "error") {
    return { filas: sistema, cargando: false, error: estado.mensaje, soloSistema: true };
  }

  const migradas: FilaTarjeta[] = estado.datos.filter((f) => f.origen === "alegra");
  return {
    filas: [...sistema, ...migradas].sort((a, b) => b.total - a.total),
    cargando: false,
    error: null,
    soloSistema: false,
  };
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
  estado: EstadoTarjeta;
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
            {estado.error} Se enseñan solo las ventas del sistema.
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
            {filas.map((f) => (
              <TR key={`${f.origen}-${f.clave}-${f.etiqueta}`}>
                <TD className="text-sm">{f.etiqueta}</TD>
                <TD className="text-right tabular-nums">{formatNumber(f.cantidad)}</TD>
                <TD className="text-right tabular-nums font-medium">{formatCurrency(f.total)}</TD>
                {mostrarPromedio && (
                  <TD className="text-right tabular-nums">
                    {formatCurrency(f.cantidad ? f.total / f.cantidad : 0)}
                  </TD>
                )}
                <TD className="pr-4">
                  <EtiquetaOrigen origen={f.origen} />
                </TD>
              </TR>
            ))}
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
