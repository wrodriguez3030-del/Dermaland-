// Cuánto se puede vender por la web, de verdad.
//
// Hasta ahora el pedido no miraba el inventario en ningún momento: se podían
// encargar 50 unidades de algo que tenía 1, y el fallo no aparecía hasta que
// alguien del negocio abría el pedido y tenía que llamar a deshacerlo. La
// tienda decía "En existencia" y el pedido se guardaba tal cual.
//
// Lo disponible no es lo que hay en el almacén. Hay que restar lo que ya está
// prometido a otros pedidos web que aún nadie ha facturado; si no, el último
// frasco se le vende a cinco personas y cuatro se quedan esperando.
//
//   disponible = existencia vendible − comprometido en pedidos web abiertos
//
// En cuanto un pedido se factura, el POS descuenta el inventario de verdad: a
// partir de ahí deja de contar como comprometido, porque ya se restó del
// almacén y contarlo dos veces escondería existencia que sí está.
//
// El pedido sigue SIN mover inventario. Esto no reserva nada: es aritmética
// sobre lo que ya hay, calculada en el momento de preguntar.

import { isSellableForWeb, type WebLotRow } from "./availability";

/** Un lote tal y como llega de `product_lots`, con su sucursal. */
export interface WebStockLot extends WebLotRow {
  productId: string;
  branchId: string;
}

/** Existencia vendible de un producto, entera y por sucursal. */
export interface ProductStock {
  /** Suma de todas las sucursales. */
  total: number;
  /** Cuánto hay en cada sucursal. Solo las que tienen algo. */
  byBranch: Map<string, number>;
}

/**
 * Existencia vendible por producto a partir de los lotes crudos.
 *
 * La regla de qué lote cuenta es la del POS y vive en `availability.ts`; aquí
 * solo se suma. `hoy` entra como parámetro para que la función sea pura.
 */
export function sellableByProduct(
  lots: readonly WebStockLot[],
  hoy: string,
): Map<string, ProductStock> {
  const porProducto = new Map<string, ProductStock>();
  for (const lote of lots) {
    if (!isSellableForWeb(lote, hoy)) continue;
    let entrada = porProducto.get(lote.productId);
    if (!entrada) {
      entrada = { total: 0, byBranch: new Map() };
      porProducto.set(lote.productId, entrada);
    }
    entrada.total += lote.currentQuantity;
    entrada.byBranch.set(
      lote.branchId,
      (entrada.byBranch.get(lote.branchId) ?? 0) + lote.currentQuantity,
    );
  }
  return porProducto;
}

/** Lo que la tienda puede seguir vendiendo de un producto. */
export interface WebAvailability {
  /** Lo que hay en el almacén, vendible. */
  physical: number;
  /** Lo prometido a pedidos web abiertos y sin facturar. */
  committed: number;
  /** `physical − committed`, nunca por debajo de cero. */
  available: number;
  byBranch: Map<string, number>;
}

/**
 * Junta existencia y compromisos.
 *
 * Nunca devuelve un negativo: si ya se prometió de más —cosa que puede pasar si
 * alguien saca mercancía por otro camino— lo que corresponde decir es "no
 * queda", no "quedan menos tres".
 */
export function webAvailability(
  stock: ProductStock | undefined,
  committed: number,
): WebAvailability {
  const physical = stock?.total ?? 0;
  const comprometido = Math.max(0, committed);
  return {
    physical,
    committed: comprometido,
    available: Math.max(0, physical - comprometido),
    byBranch: stock?.byBranch ?? new Map(),
  };
}

/** Una línea del carrito, ya resuelta a producto. */
export interface StockCheckLine {
  productId: string;
  /** Para el mensaje: el cliente entiende el nombre, no el UUID. */
  productName: string;
  qty: number;
}

export interface StockProblem {
  productName: string;
  requested: number;
  available: number;
}

/**
 * Frase para el cliente cuando algo no alcanza.
 *
 * Dice el nombre y el número: "no hay stock" a secas obliga a adivinar cuál de
 * los seis productos del carrito falla y a quitarlos de uno en uno.
 */
export function stockProblemMessage(problemas: readonly StockProblem[]): string {
  const primero = problemas[0];
  if (!primero) return "";

  const resto =
    problemas.length > 1
      ? ` (y ${problemas.length - 1} más en el carrito)`
      : "";

  return primero.available === 0
    ? `Se nos acabó ${primero.productName}. Quítalo del carrito para seguir${resto}.`
    : `Solo nos queda${primero.available === 1 ? "" : "n"} ${primero.available} de ${primero.productName} y pediste ${primero.requested}. Ajusta la cantidad${resto}.`;
}

/**
 * ¿Alcanza para todo el carrito?
 *
 * Devuelve TODAS las líneas que fallan, no la primera: quien tiene que corregir
 * el carrito prefiere enterarse de una vez.
 */
export function checkOrderStock(
  lines: readonly StockCheckLine[],
  disponible: ReadonlyMap<string, WebAvailability>,
): StockProblem[] {
  const problemas: StockProblem[] = [];
  for (const linea of lines) {
    const d = disponible.get(linea.productId)?.available ?? 0;
    if (linea.qty > d) {
      problemas.push({
        productName: linea.productName,
        requested: linea.qty,
        available: d,
      });
    }
  }
  return problemas;
}
