"use client";

import * as React from "react";
import { formatNumber } from "@/lib/utils/format";
import type {
  DesgloseOrigen,
  DimensionDesglose,
  EstadoVenta,
  FilaDesglose,
  OrigenVenta,
  VentaUnificada,
} from "./venta-unificada";

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
 *  - `useDesgloseVentas` → `?vista=desglose&dimension=…`: los mismos totales
 *    AGRUPADOS en la base (vendedor, forma de pago, producto), con el origen
 *    de cada grupo y tope de 200 grupos. Es lo que se usa para una tabla de
 *    resumen. Tampoco viaja una fila de venta. 🔴 Solo `vendedor` trae LAS DOS
 *    fuentes; `forma_pago` y `producto` traen solo Alegra, y la respuesta lo
 *    dice en `fuentes` para que nadie tenga que adivinarlo (ver
 *    `FUENTES_DESGLOSE` en `venta-unificada.ts`).
 *  - `useListadoVentas` → `?vista=listado`: una página de filas, con tope duro
 *    de 200 puesto por el SERVIDOR. Es lo que se usa para una tabla.
 *
 * Nada de esto se puede resolver en el navegador sumando filas: son 14 965
 * facturas migradas.
 */

export interface ResumenVentasApi {
  total: number;
  cantidad: number;
  /** ITBIS de las dos mitades. Lo enseña el índice de Reportes. */
  itbis: number;
  /** Unidades vendidas (cantidades de las líneas), no ventas. */
  unidades: number;
  /** Descuentos concedidos. */
  descuento: number;
  /** Clientes distintos sobre la UNIÓN de las dos fuentes, no la suma. */
  clientesDistintos: number;
  porOrigen: Record<OrigenVenta, DesgloseOrigen>;
}

/**
 * Lo que devuelve `?vista=desglose`: las filas Y de qué fuentes salen. Las dos
 * cosas juntas a propósito — un desglose que solo trae Alegra y no lo dice es
 * indistinguible de uno completo mientras `proformas` esté vacía.
 */
export interface DesgloseVentasApi {
  filas: FilaDesglose[];
  /** Orígenes que este desglose incluye de verdad. */
  fuentes: OrigenVenta[];
}

export interface ListadoVentasApi {
  ventas: VentaUnificada[];
  /** `true` si hay más filas después de esta página. */
  hayMas: boolean;
}

export interface FiltrosVentasApi {
  /**
   * Solo para `?vista=desglose`. Sin ella la ruta responde 400, no un desglose
   * vacío. Se acepta una LISTA para pedir varios desgloses en una sola
   * petición, que es lo que hacen `useDesglosesVentas` y `usePanelVentas`.
   */
  dimension?: DimensionDesglose | readonly DimensionDesglose[] | undefined;
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
  return {
    total: numeroSeguro(o.total),
    cantidad: numeroSeguro(o.cantidad),
    // Si la migración `20260907140000` todavía no está aplicada, la base no
    // manda estas dos y `numeroSeguro` devuelve 0. Es lo correcto aquí: un cero
    // de ITBIS junto a un total real se lee como «no lo sé», no como una cifra
    // inventada, y el aviso de la tarjeta ya cubre el caso de que falle entera.
    itbis: numeroSeguro(o.itbis),
    unidades: numeroSeguro(o.unidades),
    descuento: numeroSeguro(o.descuento),
  };
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
    // Mismo criterio: del desglose, no de campos sueltos.
    itbis: Math.round((sistema.itbis + alegra.itbis) * 100) / 100,
    unidades: sistema.unidades + alegra.unidades,
    descuento: Math.round((sistema.descuento + alegra.descuento) * 100) / 100,
    // 🔴 NO se suma por origen: quien compró en los dos sitios contaría dos
    // veces. Viene resuelto de la base sobre la unión.
    clientesDistintos: numeroSeguro(r.clientesDistintos),
    porOrigen: { sistema, alegra },
  };
}

/** Estado de la respuesta, si es uno de los que conocemos. */
function comoEstado(v: unknown, anulada: boolean): EstadoVenta {
  if (v === "vigente" || v === "anulada" || v === "borrador" || v === "vencida") return v;
  return anulada ? "anulada" : "vigente";
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
    // El estado viaja aparte de `anulada` a propósito: «no cuenta» y «anulada
    // fiscalmente» no son lo mismo, y una de Alegra en borrador salía con
    // badge rojo «Anulada» en la ficha del cliente. Se acepta solo un valor
    // conocido; ante una respuesta corrupta se cae al comportamiento de
    // siempre, que no inventa un estado que nadie mandó.
    estado: comoEstado(o.estado, o.anulada === true),
    // `editable` NO se cree a ciegas: lo decide el origen, igual que en
    // `venta-unificada.ts`. Una respuesta manipulada no puede convertir una
    // factura de Alegra en editable.
    editable: origen === "sistema",
  };
}

/**
 * Interpreta el JSON de `GET /api/ventas?vista=desglose`.
 *
 * 🔴 Una fila con un `origen` que no reconocemos se DESCARTA, no cae en
 * «sistema». «sistema» es el origen que `EtiquetaOrigen` pinta SIN etiqueta:
 * un fallo abierto aquí enseñaría dinero migrado como venta propia y nadie lo
 * vería. Misma regla que en el repositorio, repetida porque este lado también
 * lee de la red.
 */
export function comoDesgloseVentas(json: unknown): DesgloseVentasApi {
  const cuerpo = objeto(json);
  const crudas = cuerpo.desglose;
  const filas: FilaDesglose[] = [];
  for (const cruda of Array.isArray(crudas) ? crudas : []) {
    const o = objeto(cruda);
    if (o.origen !== "sistema" && o.origen !== "alegra") continue;
    const etiqueta = textoOpcional(o.etiqueta);
    // Sin etiqueta no hay nada que pintar: una fila en blanco con un importe al
    // lado es peor que una fila menos.
    if (!etiqueta) continue;
    filas.push({
      clave: typeof o.clave === "string" ? o.clave : "",
      etiqueta,
      origen: o.origen,
      cantidad: Math.trunc(numeroSeguro(o.cantidad)),
      total: numeroSeguro(o.total),
    });
  }
  // Las fuentes se leen igual de defensivamente que todo lo demás: un valor que
  // no sea un origen conocido no se cuela.
  const crudasFuentes = cuerpo.fuentes;
  const fuentes: OrigenVenta[] = (Array.isArray(crudasFuentes) ? crudasFuentes : []).filter(
    (f): f is OrigenVenta => f === "sistema" || f === "alegra",
  );
  return { filas, fuentes };
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

/** Las tres vistas de `/api/ventas`. */
export type VistaVentas = "resumen" | "listado" | "desglose";

/**
 * Cadena de consulta de `/api/ventas` para una vista (o VARIAS, separadas por
 * comas) y unos filtros.
 */
export function consultaVentas(
  vista: VistaVentas | readonly VistaVentas[],
  filtros: FiltrosVentasApi,
): string {
  const p = new URLSearchParams({ vista: [vista].flat().join(",") });
  // Ordenadas: dos llamadas con las mismas dimensiones en otro orden tienen
  // que dar la MISMA cadena, o el efecto las toma por consultas distintas y
  // pide dos veces lo mismo.
  const dims = filtros.dimension ? [...[filtros.dimension].flat()].sort() : [];
  if (dims.length > 0) p.set("dimension", dims.join(","));
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
  vista: VistaVentas | readonly VistaVentas[],
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
    /**
     * 🔴 Una respuesta OBSOLETA no puede escribir estado.
     *
     * La comprobación va pegada a CADA `setEstado`, no solo dentro del
     * `catch`: el aborto puede llegar después de las cabeceras y mientras se
     * lee el cuerpo. En ese momento `res.ok` ya vale `true`, así que sin esta
     * guarda una lectura interrumpida se guardaría como respuesta buena —con
     * todo a cero y en estado «listo»— y la pantalla enseñaría RD$0.00 como si
     * fuera el total, sin el aviso. Es exactamente el fallo que este trabajo
     * existe para cerrar.
     *
     * Pasa de verdad al cambiar de periodo o de sucursal con una petición en
     * vuelo: la vieja se aborta y, contra 14 965 facturas, la nueva tarda.
     */
    const vigente = () => !ctrl.signal.aborted;
    setEstado({ tipo: "cargando" });
    fetch(`/api/ventas?${consulta}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        /**
         * 🔴 Un cuerpo que no se puede leer NO es un dato.
         *
         * Si el servidor contestó 200 y el cuerpo se corta a medias (conexión
         * caída → `TypeError`) o no es JSON (`SyntaxError`), lo que hay es un
         * error, no «cero ventas». Devolver `null` aquí hacía que
         * `comoResumenVentas(null)` diera todo a cero y que ese cero se
         * guardara como «listo», sin aviso: indistinguible de un periodo real
         * sin ventas. Es el mismo RD$0.00 silencioso que este trabajo existe
         * para matar, entrando por la puerta de al lado.
         *
         * La excepción es una respuesta de ERROR: ahí el cuerpo puede
         * legítimamente no ser JSON (un 502 de un proxy, por ejemplo), y lo que
         * manda es el estado, no el cuerpo.
         */
        let json: unknown = null;
        try {
          json = await res.json();
        } catch (e: unknown) {
          // Un aborto a mitad del cuerpo sube tal cual: lo descarta la guarda
          // de abajo, no se convierte en un error que enseñar.
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          if (res.ok) throw new Error(FALLO_HISTORICO);
          json = null;
        }
        if (!res.ok) throw new Error(comoMensajeError(json) ?? FALLO_HISTORICO);
        return interpretarRef.current(json);
      })
      .then((datos) => {
        if (!vigente()) return;
        setEstado({ tipo: "listo", datos });
      })
      .catch((e: unknown) => {
        if (!vigente()) return;
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

/**
 * Desglose ya agrupado en la base, con el origen de cada grupo. Para las
 * tarjetas de resumen del reporte: ninguna pantalla agrupa filas a mano.
 *
 * `activo` en `false` NO deja el estado en «listo con cero filas»: se queda en
 * «cargando» y no se dispara petición. Quien llame decide qué enseñar en ese
 * caso — igual que hace `resolverHistorico` con el resumen.
 */
export function useDesgloseVentas(
  dimension: DimensionDesglose,
  filtros: FiltrosVentasApi,
  activo = true,
): EstadoVentas<DesgloseVentasApi> {
  return useVentasApi("desglose", { ...filtros, dimension }, activo, comoDesgloseVentas);
}

/**
 * El PANEL entero en una sola petición: resumen, últimas ventas y los
 * desgloses que comparten filtros.
 *
 * 🔴 Los tres llevaban EXACTAMENTE los mismos filtros y viajaban por separado.
 * Medido en el navegador: el panel disparaba trece peticiones al cargar, y cada
 * una es una función sin servidor con su propio arranque.
 *
 * Devuelve cada trozo con la MISMA forma que tendría pedido solo, para que las
 * pantallas no tengan que aprender otra cosa.
 */
export function usePanelVentas(
  dimensiones: readonly DimensionDesglose[],
  filtros: FiltrosVentasApi,
  activo = true,
): {
  resumen: EstadoVentas<ResumenVentasApi>;
  listado: EstadoVentas<ListadoVentasApi>;
  desgloses: Record<DimensionDesglose, EstadoVentas<DesgloseVentasApi>>;
} {
  const clave = [...dimensiones].sort().join(",");
  const estado = useVentasApi(
    ["resumen", "listado", "desglose"],
    { ...filtros, dimension: dimensiones },
    activo && dimensiones.length > 0,
    (json) => json,
  );

  return React.useMemo(() => {
    const cuerpo =
      estado.tipo === "listo"
        ? (estado.datos as { desgloses?: Record<string, unknown> })
        : undefined;
    const desgloses = {} as Record<DimensionDesglose, EstadoVentas<DesgloseVentasApi>>;
    for (const d of dimensiones) {
      if (!cuerpo) {
        desgloses[d] = estado as EstadoVentas<DesgloseVentasApi>;
        continue;
      }
      const trozo = cuerpo.desgloses?.[d];
      desgloses[d] = trozo
        ? { tipo: "listo", datos: comoDesgloseVentas(trozo) }
        : { tipo: "error", mensaje: "El servidor no devolvió este desglose." };
    }
    return {
      resumen: cuerpo
        ? { tipo: "listo" as const, datos: comoResumenVentas(cuerpo) }
        : (estado as EstadoVentas<ResumenVentasApi>),
      listado: cuerpo
        ? { tipo: "listo" as const, datos: comoListadoVentas(cuerpo) }
        : (estado as EstadoVentas<ListadoVentasApi>),
      desgloses,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, clave]);
}

/**
 * VARIOS desgloses en UNA sola petición.
 *
 * 🔴 Por qué: el panel llamaba a `useDesgloseVentas` cuatro veces —sucursal,
 * forma de pago, producto y mes— y la pantalla de reportes cinco. Cada una es
 * una petición a una función sin servidor con su propio arranque, y el
 * navegador además limita cuántas lanza a la vez. Medido en el navegador el
 * 08/09/2026: el panel disparaba TRECE peticiones al cargar.
 *
 * El servidor las resuelve en paralelo contra la base, donde cuestan ~100 ms
 * cada una y no se estorban.
 *
 * Devuelve un estado por dimensión, con la MISMA forma que devolvía el hook de
 * una sola: quien lo consume no tiene que aprender otra cosa.
 */
export function useDesglosesVentas(
  dimensiones: readonly DimensionDesglose[],
  filtros: FiltrosVentasApi,
  activo = true,
): Record<DimensionDesglose, EstadoVentas<DesgloseVentasApi>> {
  // La clave se ordena para que dos listas con las mismas dimensiones en otro
  // orden no cuenten como una consulta distinta.
  const clave = [...dimensiones].sort().join(",");
  const estado = useVentasApi(
    "desglose",
    { ...filtros, dimension: dimensiones },
    activo && dimensiones.length > 0,
    (json) => json,
  );

  return React.useMemo(() => {
    const salida = {} as Record<DimensionDesglose, EstadoVentas<DesgloseVentasApi>>;
    for (const d of dimensiones) {
      if (estado.tipo !== "listo") {
        salida[d] = estado as EstadoVentas<DesgloseVentasApi>;
        continue;
      }
      const cuerpo = estado.datos as { desgloses?: Record<string, unknown> } | undefined;
      const trozo = cuerpo?.desgloses?.[d];
      // Sin su trozo, esa dimensión no está lista — nunca un desglose vacío que
      // la pantalla pintaría como «sin datos».
      salida[d] = trozo
        ? { tipo: "listo", datos: comoDesgloseVentas(trozo) }
        : { tipo: "error", mensaje: "El servidor no devolvió este desglose." };
    }
    return salida;
    // `clave` resume las dimensiones; `estado` cambia cuando llega la respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, clave]);
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
