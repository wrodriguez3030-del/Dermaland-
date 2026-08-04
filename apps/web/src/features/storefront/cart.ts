// El carrito de la tienda.
//
// Regla que gobierna este archivo: **el navegador guarda QUÉ, el servidor pone
// CUÁNTO**. En `localStorage` solo viven `slug` y cantidad. Si el precio viajara
// ahí, cambiarlo con la consola del navegador sería cambiar lo que se cobra.
//
// Y todo lo que entra por `parseCartItems` se trata como hostil: puede venir de
// una versión anterior del sitio, de otra pestaña, o de alguien jugando. Nada de
// eso debe romper la página ni colarse en una consulta.
//
// Esto NO es el motor del POS. El del POS tiene descuento global, sesión de caja
// y reglas documentales que la web no tiene; compartirlos acoplaría dos cosas
// que evolucionan por separado.

import type { PublicProduct } from "./types";

/** Nadie compra 300 unidades de una crema por internet: es un dedo pegado. */
export const MAX_QTY_PER_LINE = 20;

/** Tope de líneas distintas. Un carrito fabricado no debe reventar la página. */
export const MAX_LINES = 50;

/** Lo ÚNICO que se guarda en el navegador. */
export interface CartItem {
  slug: string;
  qty: number;
}

export interface CartLine {
  product: PublicProduct;
  qty: number;
  /** Precio del catálogo × cantidad. Con ITBIS incluido, como el POS. */
  lineTotal: number;
}

export interface DroppedLine {
  slug: string;
  /** Frase que se le enseña al cliente, no un código. */
  reason: string;
}

export interface CartSummary {
  lines: CartLine[];
  /** Unidades, no líneas: es lo que va en el contador del encabezado. */
  itemCount: number;
  total: number;
  dropped: DroppedLine[];
}

/** Dos decimales. Sumar flotantes deja 7501.499999999999 sin esto. */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function limpiarCantidad(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_QTY_PER_LINE, Math.max(0, Math.trunc(n)));
}

/**
 * Convierte lo que hubiera guardado en algo utilizable. Nunca lanza.
 *
 * Acepta la cadena tal cual salió de `localStorage` o el objeto ya parseado,
 * para poder probarlo sin navegador.
 */
export function parseCartItems(raw: unknown): CartItem[] {
  let datos: unknown = raw;
  if (typeof raw === "string") {
    try {
      datos = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(datos)) return [];

  // `Map` y no `filter`: fusiona repetidos conservando el orden de aparición.
  const porSlug = new Map<string, number>();
  for (const entrada of datos) {
    if (typeof entrada !== "object" || entrada === null) continue;
    const { slug, qty } = entrada as { slug?: unknown; qty?: unknown };
    if (typeof slug !== "string" || !slug.trim()) continue;
    const cantidad = limpiarCantidad(qty);
    if (cantidad === 0) continue;
    const clave = slug.trim();
    porSlug.set(
      clave,
      Math.min(MAX_QTY_PER_LINE, (porSlug.get(clave) ?? 0) + cantidad),
    );
    if (porSlug.size >= MAX_LINES) break;
  }

  return [...porSlug].map(([slug, qty]) => ({ slug, qty }));
}

export function addItem(
  items: readonly CartItem[],
  slug: string,
  qty = 1,
): CartItem[] {
  return parseCartItems([...items, { slug, qty }]);
}

export function setItemQty(
  items: readonly CartItem[],
  slug: string,
  qty: number,
): CartItem[] {
  return parseCartItems(items.map((i) => (i.slug === slug ? { slug, qty } : i)));
}

export function removeItem(
  items: readonly CartItem[],
  slug: string,
): CartItem[] {
  return items.filter((i) => i.slug !== slug);
}

export function cartItemCount(items: readonly CartItem[]): number {
  return items.reduce((suma, i) => suma + i.qty, 0);
}

/**
 * Resuelve el carrito contra el catálogo publicado.
 *
 * Aquí es donde el precio deja de ser del cliente y pasa a ser del negocio. Se
 * llama en el SERVIDOR (ruta `/api/storefront/cart`); el navegador nunca calcula
 * un total que después se cobre.
 */
export function buildCartSummary(
  items: readonly CartItem[],
  catalog: readonly PublicProduct[],
): CartSummary {
  const porSlug = new Map(catalog.map((p) => [p.slug, p]));
  const lines: CartLine[] = [];
  const dropped: DroppedLine[] = [];

  for (const item of items) {
    const producto = porSlug.get(item.slug);
    if (!producto) {
      // Se despublicó, se le quitó la foto o le cambiaron el nombre: para la
      // tienda ese producto ya no existe.
      dropped.push({ slug: item.slug, reason: "Ya no está disponible" });
      continue;
    }
    if (producto.availability.status === "out_of_stock") {
      dropped.push({ slug: item.slug, reason: "Se agotó" });
      continue;
    }
    lines.push({
      product: producto,
      qty: item.qty,
      lineTotal: redondear(producto.price * item.qty),
    });
  }

  return {
    lines,
    itemCount: lines.reduce((suma, l) => suma + l.qty, 0),
    total: redondear(lines.reduce((suma, l) => suma + l.lineTotal, 0)),
    dropped,
  };
}
