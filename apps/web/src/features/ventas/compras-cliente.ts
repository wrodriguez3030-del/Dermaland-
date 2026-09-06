import type { Proforma } from "@/types";
import { porOrigen } from "./agregados";
import { desdeProforma, type VentaUnificada } from "./venta-unificada";

/**
 * Compras de UN cliente, las del sistema y las migradas de Alegra en la misma
 * lista y ordenadas por fecha. PURO: recibe lo ya cargado, no toca red ni
 * reloj.
 *
 * Hasta ahora la ficha del cliente enseñaba sus compras de Alegra en otra
 * pestaña, así que quien miraba «Compras» veía una lista vacía de alguien que
 * lleva años comprando. La pestaña separada se queda —sirve para mirar solo lo
 * de Alegra—, pero el listado principal ya no las ignora.
 *
 * Las del sistema NO se toman de la API aunque también vengan ahí: se toman de
 * las proformas que la ficha ya tiene cargadas. Dos razones, las dos de peso:
 * la proforma completa es la que permite abrir, imprimir y enviar el documento
 * (la venta unificada no lleva ítems ni pagos), y sin Supabase la API no
 * devuelve nada — apoyarse en ella dejaría la ficha en blanco en desarrollo.
 */
export interface CompraCliente {
  venta: VentaUnificada;
  /** La proforma original cuando es del sistema; `null` si viene de Alegra. */
  proforma: Proforma | null;
}

/**
 * Une las proformas del cliente con sus facturas migradas, de la más reciente
 * a la más antigua.
 *
 * `ventasApi` es la página de `/api/ventas?clienteId=…`: de ahí solo se toman
 * las de Alegra. Si una venta del sistema apareciera en las dos fuentes, manda
 * la proforma local (es la que trae los ítems y las acciones).
 */
export function combinarComprasCliente(
  proformas: Proforma[],
  ventasApi: VentaUnificada[],
): CompraCliente[] {
  const filas: CompraCliente[] = proformas.map((p) => ({
    venta: desdeProforma(p),
    proforma: p,
  }));
  const yaEstan = new Set(filas.map((f) => f.venta.id));
  for (const v of ventasApi) {
    if (v.origen !== "alegra" || yaEstan.has(v.id)) continue;
    yaEstan.add(v.id);
    filas.push({ venta: v, proforma: null });
  }
  return filas.sort((a, b) => (a.venta.fecha < b.venta.fecha ? 1 : a.venta.fecha > b.venta.fecha ? -1 : 0));
}

export interface ResumenComprasCliente {
  cantidadSistema: number;
  cantidadAlegra: number;
  /** Total comprado por el cliente en las dos fuentes, sin las anuladas. */
  total: number;
}

/**
 * Cuánto ha comprado el cliente y por qué fuente. Se apoya en `porOrigen`
 * (`agregados.ts`), que ya excluye las anuladas y suma en centavos enteros: no
 * se escribe una suma nueva.
 *
 * Aquí sí se suma en el navegador, y está bien: son las compras de UN cliente
 * —172 en el caso más grande del negocio—, ya cargadas para pintarlas. La
 * regla de no descargar filas para contarlas es sobre los totales del negocio,
 * que son 14 965 facturas y se cuentan en la base.
 */
export function resumenComprasCliente(compras: CompraCliente[]): ResumenComprasCliente {
  const d = porOrigen(compras.map((c) => c.venta));
  return {
    cantidadSistema: d.sistema.cantidad,
    cantidadAlegra: d.alegra.cantidad,
    total: Math.round((d.sistema.total + d.alegra.total) * 100) / 100,
  };
}
