"use client";

import * as React from "react";
import { formatNumber } from "@/lib/utils/format";
import type { DesgloseOrigen } from "./agregados";
import type { OrigenVenta, VentaUnificada } from "./venta-unificada";

/**
 * Cliente de `GET /api/ventas` (ventas unificadas: proformas del sistema +
 * histórico migrado de Alegra) para las pantallas.
 *
 * Existe para que las cuatro pantallas del plan —panel, reportes, ficha del
 * cliente y cuentas por cobrar— pidan lo mismo de la misma manera, y sobre
 * todo para que el texto que explica de dónde sale cada número se escriba UNA
 * vez: un total que mezcla dos fuentes sin decir cuánto pone cada una no se
 * puede auditar, y esa frase no puede decir una cosa en el panel y otra en el
 * reporte.
 *
 * Dos vistas, dos costos muy distintos (ver
 * `server/repositories/supabase/ventas-unificadas.ts`):
 *
 *  - `useResumenVentas` → `?vista=resumen`: totales YA CALCULADOS en la base,
 *    decenas de bytes. Es lo que se usa para un KPI. Ninguna pantalla
 *    descarga filas para contarlas.
 *  - `useListadoVentas` → `?vista=listado`: una página de filas, con tope duro
 *    de 200 puesto por el SERVIDOR. Es lo que se usa para una tabla.
 *
 * Nada de esto se puede resolver en el navegador sumando filas: son 14 965
 * facturas migradas.
 */

/**
 * Tope duro de filas por página. Lo decide el servidor
 * (`ventas-unificadas.ts#TOPE_LISTADO`); aquí se repite solo para no pedir de
 * más y creer que se recibió todo. Si los dos dejaran de coincidir, el
 * servidor sigue mandando: devuelve 200 y `hayMas: true`.
 */
export const TOPE_LISTADO_VENTAS = 200;

export interface ResumenVentasApi {
  total: number;
  cantidad: number;
  porOrigen: Record<OrigenVenta, DesgloseOrigen>;
}

export interface ListadoVentasApi {
  ventas: VentaUnificada[];
  /** `true` si hay más filas después de esta página. */
  hayMas: boolean;
}

export interface FiltrosVentasApi {
  /** `YYYY-MM-DD`, inclusive. */
  desde?: string | undefined;
  /** `YYYY-MM-DD`, inclusive. */
  hasta?: string | undefined;
  clienteId?: string | undefined;
  sucursalId?: string | undefined;
  /** `false` deja fuera el histórico migrado. Por defecto entra. */
  incluirAlegra?: boolean | undefined;
  limite?: number | undefined;
  desplazamiento?: number | undefined;
}

/**
 * Estado de la carga. Hay un estado «cargando» explícito a propósito: mientras
 * el histórico está en camino NO hay número fiable que enseñar, y un RD$0.00
 * provisional es exactamente lo que hizo creer que los datos no se habían
 * migrado.
 */
export type EstadoVentas<T> =
  | { tipo: "cargando" }
  | { tipo: "listo"; datos: T }
  | { tipo: "error"; mensaje: string };

/** Mensaje por defecto cuando la respuesta no trae uno propio. */
export const FALLO_HISTORICO = "No se pudo cargar el histórico migrado de Alegra.";

// ── Lectura defensiva del JSON ──────────────────────────────────────────────
// La respuesta llega por red: nada se usa sin comprobar su forma.

function numeroSeguro(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function objeto(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}

function comoDesglose(v: unknown): DesgloseOrigen {
  const o = objeto(v);
  return { total: numeroSeguro(o.total), cantidad: numeroSeguro(o.cantidad) };
}

/** Interpreta el JSON de `GET /api/ventas?vista=resumen`. */
export function comoResumenVentas(json: unknown): ResumenVentasApi {
  const r = objeto(objeto(json).resumen);
  const po = objeto(r.porOrigen);
  const sistema = comoDesglose(po.sistema);
  const alegra = comoDesglose(po.alegra);
  return {
    // El total y la cantidad se toman del desglose, no de los campos sueltos:
    // así el número grande y su explicación no pueden discrepar aunque la
    // respuesta venga incompleta.
    total: Math.round((sistema.total + alegra.total) * 100) / 100,
    cantidad: sistema.cantidad + alegra.cantidad,
    porOrigen: { sistema, alegra },
  };
}

/** Una fila del listado, o `null` si no tiene la forma mínima de una venta. */
function comoVenta(v: unknown): VentaUnificada | null {
  const o = objeto(v);
  const id = textoOpcional(o.id);
  const fecha = textoOpcional(o.fecha);
  if (!id || !fecha) return null;
  const origen: OrigenVenta = o.origen === "alegra" ? "alegra" : "sistema";
  return {
    id,
    origen,
    numero: textoOpcional(o.numero) ?? "—",
    fecha,
    clienteId: textoOpcional(o.clienteId),
    clienteNombre: textoOpcional(o.clienteNombre),
    total: numeroSeguro(o.total),
    itbis: numeroSeguro(o.itbis),
    subtotal: numeroSeguro(o.subtotal),
    formaPago: textoOpcional(o.formaPago),
    vendedor: textoOpcional(o.vendedor),
    sucursalId: textoOpcional(o.sucursalId),
    anulada: o.anulada === true,
    // `editable` NO se cree a ciegas: lo decide el origen, igual que en
    // `venta-unificada.ts`. Una respuesta manipulada no puede convertir una
    // factura de Alegra en editable.
    editable: origen === "sistema",
  };
}

/** Interpreta el JSON de `GET /api/ventas?vista=listado`. */
export function comoListadoVentas(json: unknown): ListadoVentasApi {
  const o = objeto(json);
  const crudas = Array.isArray(o.ventas) ? o.ventas : [];
  const ventas: VentaUnificada[] = [];
  for (const cruda of crudas) {
    const venta = comoVenta(cruda);
    if (venta) ventas.push(venta);
  }
  return { ventas, hayMas: o.hayMas === true };
}

/** Mensaje de error del cuerpo de una respuesta no-OK, si lo trae. */
export function comoMensajeError(json: unknown): string | null {
  return textoOpcional(objeto(json).error);
}

// ── Petición ────────────────────────────────────────────────────────────────

/** Cadena de consulta de `/api/ventas` para una vista y unos filtros. */
export function consultaVentas(
  vista: "resumen" | "listado",
  filtros: FiltrosVentasApi,
): string {
  const p = new URLSearchParams({ vista });
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.clienteId) p.set("clienteId", filtros.clienteId);
  if (filtros.sucursalId) p.set("sucursalId", filtros.sucursalId);
  // Solo el literal "false" desactiva Alegra (así lo lee la ruta): se manda
  // únicamente cuando hay que apagarlo, para no depender de cómo se serialice
  // un booleano.
  if (filtros.incluirAlegra === false) p.set("incluirAlegra", "false");
  if (filtros.limite != null) p.set("limite", String(filtros.limite));
  if (filtros.desplazamiento != null) p.set("desplazamiento", String(filtros.desplazamiento));
  return p.toString();
}

/**
 * Carga una vista de `/api/ventas`. La consulta viaja como CADENA en las
 * dependencias del efecto: un objeto de filtros nuevo en cada render dispararía
 * una petición por render.
 */
function useVentasApi<T>(
  vista: "resumen" | "listado",
  filtros: FiltrosVentasApi,
  activo: boolean,
  interpretar: (json: unknown) => T,
): EstadoVentas<T> {
  const consulta = consultaVentas(vista, filtros);
  const [estado, setEstado] = React.useState<EstadoVentas<T>>({ tipo: "cargando" });
  // `interpretar` es una función estable de este módulo, pero se guarda en una
  // ref para no obligar a quien llame a memorizarla.
  const interpretarRef = React.useRef(interpretar);
  interpretarRef.current = interpretar;

  React.useEffect(() => {
    if (!activo) return;
    const ctrl = new AbortController();
    setEstado({ tipo: "cargando" });
    fetch(`/api/ventas?${consulta}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error(comoMensajeError(json) ?? FALLO_HISTORICO);
        return interpretarRef.current(json);
      })
      .then((datos) => setEstado({ tipo: "listo", datos }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // La migración `20260906130000_resumen_ventas_unificadas.sql` puede no
        // estar aplicada todavía: la API responde con un mensaje claro y aquí
        // se enseña, en vez de fingir un cero silencioso.
        setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : FALLO_HISTORICO });
      });
    return () => ctrl.abort();
  }, [consulta, activo]);

  return estado;
}

/** Totales de ventas ya calculados en la base. Para KPIs, nunca para tablas. */
export function useResumenVentas(
  filtros: FiltrosVentasApi,
  activo = true,
): EstadoVentas<ResumenVentasApi> {
  return useVentasApi("resumen", filtros, activo, comoResumenVentas);
}

/** Una página de ventas unificadas. Para tablas, nunca para sumar un total. */
export function useListadoVentas(
  filtros: FiltrosVentasApi,
  activo = true,
): EstadoVentas<ListadoVentasApi> {
  return useVentasApi("listado", filtros, activo, comoListadoVentas);
}

// ── Texto ───────────────────────────────────────────────────────────────────

/**
 * Desglose por origen en una línea: cuántas ventas puso el sistema y cuántas
 * son histórico migrado. Es la explicación obligatoria de todo total que suma
 * las dos fuentes — el panel, los reportes y la ficha del cliente dicen esto
 * mismo con estas mismas palabras.
 */
export function textoDesgloseOrigen(cantidadSistema: number, cantidadAlegra: number): string {
  const total = cantidadSistema + cantidadAlegra;
  const plural = (n: number) => (n === 1 ? "venta" : "ventas");
  if (total === 0) return "Sin ventas en el período.";
  if (cantidadAlegra === 0) return `${formatNumber(cantidadSistema)} ${plural(cantidadSistema)} del sistema`;
  if (cantidadSistema === 0) {
    return `${formatNumber(cantidadAlegra)} ${plural(cantidadAlegra)} · todas migradas de Alegra`;
  }
  return (
    `${formatNumber(total)} ${plural(total)} · ${formatNumber(cantidadSistema)} del sistema, ` +
    `${formatNumber(cantidadAlegra)} migradas de Alegra`
  );
}
