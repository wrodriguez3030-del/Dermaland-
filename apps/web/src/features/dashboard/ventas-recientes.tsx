"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import { desdeProforma, pinturaEstadoVenta, type VentaUnificada } from "@/features/ventas/venta-unificada";
import {
  useListadoVentas,
  type EstadoVentas,
  type FiltrosVentasApi,
  type ListadoVentasApi,
} from "@/features/ventas/ventas-api";
import type { Proforma } from "@/types";

/**
 * «Ventas recientes» del panel.
 *
 * 🔴 Qué estaba roto. La lista salía de `proformas`, que hoy tiene 0 filas, así
 * que decía «Aún no hay ventas registradas hoy» con el histórico migrado
 * delante. Misma causa que las cuatro tarjetas de arriba.
 *
 * Esto es un LISTADO, no un agregado: va por `GET /api/ventas?vista=listado`,
 * que ya devuelve las ventas de las dos fuentes ordenadas por fecha y con tope
 * duro de 200 filas puesto por el servidor. Aquí se piden 8, que son las que
 * caben en la tarjeta.
 *
 * 🔴 De dónde sale cada mitad, y por qué NO se toma entera del endpoint:
 *
 *  - Las del SISTEMA salen de las ventas que la pantalla ya tiene filtradas
 *    con `esVentaCompletada` (cobradas, cobradas a medias, emitidas o
 *    convertidas a e-CF). El endpoint no filtra por estado —a propósito: es un
 *    recorte por fecha, no un agregado— así que su mitad del sistema traería
 *    también proformas `pending`, que todavía NO son una venta y saldrían aquí
 *    sin ningún distintivo. Es el mismo criterio que ya siguen las cuatro
 *    tarjetas de arriba y el KPI.
 *  - Las MIGRADAS salen del endpoint, que es lo único que las sabe traer sin
 *    descargar 14 965 facturas.
 *
 * (Cuando el punto de venta empiece a facturar mucho, la página de 8 que
 * devuelve el endpoint puede repartirse entre las dos fuentes y llegar menos
 * de 8 migradas. Las que lleguen siguen siendo las MÁS RECIENTES —las que no
 * llegan son más viejas que todas las que sí—, así que la lista nunca enseña
 * una venta antigua en lugar de una nueva; como mucho enseña menos de 8.)
 *
 * 🔴 Lo migrado NO se abre ni se edita. Alegra manda y DermaLand solo lee
 * (`editable` es siempre `false` para el histórico): la fila del sistema
 * enlaza a su venta, la migrada no enlaza a ningún sitio.
 */

/** Cuántas ventas caben en la tarjeta. */
/** Cuántas ventas caben en la tarjeta. La pide el panel para agrupar la petición. */
export const VISIBLES = 8;

/** Fecha de una venta, con la precisión que de verdad tiene su origen. */
function fechaVisible(v: VentaUnificada): string {
  // El histórico migrado guarda `date` (un día, sin hora): enseñar «00:00»
  // sería inventarse una precisión que el dato no tiene.
  return v.origen === "sistema" ? formatDateTime(v.fecha) : formatDate(v.fecha);
}

/**
 * Junta las ventas del sistema con las migradas y devuelve las más recientes.
 * PURA: aquí vive la regla de qué se enseña, y una regla así se prueba.
 */
export function ventasRecientes(
  sistema: VentaUnificada[],
  migradas: VentaUnificada[],
  visibles = VISIBLES,
): VentaUnificada[] {
  return [...sistema, ...migradas]
    // Fechas ISO: comparar como texto ordena igual que como fecha, y no
    // construye 8 objetos `Date` por render.
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.id.localeCompare(b.id)))
    .slice(0, visibles);
}

/** Una fila de la lista. El enlace solo existe si la venta se puede abrir. */
function FilaVenta({ venta }: { venta: VentaUnificada }) {
  const pintura = pinturaEstadoVenta(venta.estado);
  const cuerpo = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {venta.numero} · {venta.clienteNombre ?? "Consumidor final"}
          </span>
          <EtiquetaOrigen origen={venta.origen} />
        </div>
        <div className="text-xs opacity-60">
          {venta.vendedor ?? "Sin vendedor"} · {fechaVisible(venta)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={
            pintura.tachada
              ? "text-sm font-semibold line-through opacity-60"
              : pintura.atenuada
                ? "text-sm font-semibold opacity-50"
                : "text-sm font-semibold"
          }
        >
          {formatCurrency(venta.total)}
        </span>
        {pintura.etiqueta && <Badge tone={pintura.tono}>{pintura.etiqueta}</Badge>}
      </div>
    </>
  );

  // 🔴 Solo lo del sistema se abre. Una factura de Alegra no se puede editar
  // aquí: si se pudiera, alguien «anularía» desde DermaLand una factura que en
  // Alegra sigue viva y los dos sistemas dejarían de cuadrar.
  if (!venta.editable) {
    return <li className="flex items-center justify-between gap-3 px-6 py-3">{cuerpo}</li>;
  }
  return (
    <li>
      <Link
        href={`/ventas/${venta.id}`}
        className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-black/[0.02]"
      >
        {cuerpo}
      </Link>
    </li>
  );
}

/** «Ventas recientes»: las últimas del período, de las dos fuentes. */
export function VentasRecientes({
  ventasDelSistema,
  filtros,
  historicoParticipa,
  listadoDelPanel,
}: {
  /** Ventas completadas del sistema dentro del filtro del panel. */
  ventasDelSistema: Proforma[];
  /** Los tres filtros que el histórico sabe aplicar. */
  filtros: Pick<FiltrosVentasApi, "desde" | "hasta" | "sucursalId">;
  /**
   * `true` cuando el periodo se puede expresar como un rango de fechas. El
   * combo «mes fijo + año Todos» no lo es: la lista se queda con lo del
   * sistema y lo DICE.
   */
  historicoParticipa: boolean;
  /**
   * El listado YA PEDIDO por el panel, que lo trae junto al resumen y a los
   * desgloses en una sola petición (`usePanelVentas`). Cuando llega, esta
   * tarjeta no pide nada por su cuenta.
   *
   * Sin él la tarjeta se vale sola —lo hace en sus pruebas y lo haría en
   * cualquier otra pantalla—, pero en el panel eso era una función sin
   * servidor de más por los MISMOS filtros.
   */
  listadoDelPanel?: EstadoVentas<ListadoVentasApi> | undefined;
}) {
  // 🔴 El `activo` en `false` no es un detalle: sin él esta tarjeta seguiría
  // pidiendo lo mismo que el panel ya trajo. La regla de los hooks impide
  // llamarlo condicionalmente, así que se llama siempre y se apaga.
  const propio = useListadoVentas(
    { ...filtros, limite: VISIBLES },
    historicoParticipa && !listadoDelPanel,
  );
  const listado = listadoDelPanel ?? propio;

  const delSistema = React.useMemo(
    () => ventasDelSistema.map(desdeProforma),
    [ventasDelSistema],
  );
  const migradas =
    listado.tipo === "listo" ? listado.datos.ventas.filter((v) => v.origen === "alegra") : [];
  const filas = ventasRecientes(delSistema, migradas);

  const cargando = historicoParticipa && listado.tipo === "cargando";
  const error = historicoParticipa && listado.tipo === "error" ? listado.mensaje : null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Ventas recientes</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Las {VISIBLES} más recientes del período — ventas del sistema e histórico migrado.
          </p>
          {cargando && (
            <p className="mt-1 text-[11px] opacity-60">Cargando el histórico migrado de Alegra…</p>
          )}
          {error && (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error} Se enseñan solo las ventas del sistema.
            </p>
          )}
        </div>
        {/* Antes decía «Ver proformas →» y llevaba a /proformas. La lista ya no
            es solo de proformas, y esa pantalla no cuenta el histórico: el
            dueño saldría de una lista con facturas migradas y aterrizaría
            donde no están. /ventas sí las cuenta. */}
        <Link
          href="/ventas?period=all"
          className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
        >
          Ver ventas →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-black/5">
          {filas.length === 0 && !cargando && (
            <li className="px-6 py-8 text-center text-sm opacity-60">
              Aún no hay ventas registradas en el período.
            </li>
          )}
          {filas.map((v) => (
            <FilaVenta key={`${v.origen}-${v.id}`} venta={v} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
