// Productos esperados que NUNCA se escanearon en un conteo físico.
//
// Antes de este archivo, un conteo solo "sabía" de los productos que alguien
// escaneó: si un producto físico existía en el sistema con stock > 0 pero
// nadie lo escaneó (se saltó un anaquel, el lector falló, se acabó el turno),
// no aparecía en ningún lado — ni en la tabla en vivo, ni en el resumen de
// aprobación, ni en el Excel/PDF. El conteo podía cerrarse "limpio" sin haber
// tocado la mitad del inventario real. Este módulo calcula esos faltantes
// SILENCIOSOS a partir del alcance del conteo (sucursal + categoría/marca/
// laboratorio si se filtró al crearlo) para que se documenten como
// "Faltante" igual que cualquier otra diferencia.
//
// No aplica a "spot check": es una muestra a propósito, no un barrido
// completo, así que no tiene sentido marcar todo el catálogo como faltante.
//
// Tampoco aplica a "Inventario parcial" SIN categoría/marca/laboratorio
// elegidos: el formulario de creación deja esos tres filtros opcionales, así
// que un "parcial" sin ninguno no tiene un alcance definido — no hay forma de
// saber qué subconjunto se pensaba contar, y tratarlo como si fuera "total"
// marcaría el catálogo entero como faltante por error (Codex, revisión
// 13/09/2026). Un "parcial" CON filtro sí tiene alcance claro (p. ej. "todo
// Cuidado facial") y ahí sí se infieren los faltantes de esa categoría.

import type { Product } from "@/types";
import type { CountSession, CountSessionItem } from "./scan-session-store";

function inCountScope(session: CountSession, product: Product): boolean {
  if (session.categoryId && product.categoryId !== session.categoryId) return false;
  if (session.brandId && product.brandId !== session.brandId) return false;
  if (session.laboratoryId && product.laboratoryId !== session.laboratoryId) return false;
  return true;
}

function hasDefinedScope(session: CountSession): boolean {
  if (session.type === "spot") return false;
  if (session.type === "partial") {
    return !!(session.categoryId || session.brandId || session.laboratoryId);
  }
  return true; // "full": todo el catálogo (o el filtro elegido, si hay uno).
}

/**
 * Productos dentro del alcance del conteo, con stock de sistema > 0, que no
 * tienen ninguna fila en `session.items` (o sea: nadie los escaneó ni se
 * agregaron a mano). Se devuelven como `CountSessionItem` con
 * `countedQuantity: 0` para poder mezclarse con los reales.
 */
export function missingCountItems(
  session: CountSession,
  products: Product[],
  systemQuantityFor: (productId: string) => number,
): CountSessionItem[] {
  if (!hasDefinedScope(session)) return [];
  const scanned = new Set(session.items.map((it) => it.productId));
  const out: CountSessionItem[] = [];
  for (const p of products) {
    if (scanned.has(p.id)) continue;
    if (!inCountScope(session, p)) continue;
    const sys = systemQuantityFor(p.id);
    if (sys <= 0) continue;
    out.push({
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      barcode: p.barcode,
      countedQuantity: 0,
      lastScannedAt: "",
    });
  }
  return out;
}

/** Ítems realmente escaneados/agregados + los faltantes calculados arriba. */
export function withMissingItems(
  session: CountSession,
  products: Product[],
  systemQuantityFor: (productId: string) => number,
): CountSessionItem[] {
  return [
    ...session.items,
    ...missingCountItems(session, products, systemQuantityFor),
  ];
}
