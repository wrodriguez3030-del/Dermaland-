// ¿Desde qué sucursal se factura un pedido web, y qué falta para poder hacerlo?
//
// POLÍTICA DEL NEGOCIO (decidida por el dueño el 2026-08-06)
//
// Un pedido web se factura **SIEMPRE desde la sucursal de despacho web**
// (`is_web_fulfillment`, hoy "DermaLand Principal"). Sin excepciones y sin
// mudarse solo.
//
// Si ahí no hay existencia, la respuesta NO es facturar desde otro sitio: es
// que un administrador **transfiera la mercancía** desde la otra sucursal a la
// Principal, y entonces se factura. Para eso existe el módulo de
// transferencias, que descuenta y acredita de verdad.
//
// QUÉ HABÍA ANTES, Y POR QUÉ CAMBIÓ
//
// El POS elegía la sucursal "que más líneas cubriera". Nació de un problema
// real —Cutis estaba anunciada en la tienda con cero lotes y el POS se abría
// ahí con el carrito vacío—, pero resolvía el síntoma: dejaba la mercancía
// donde estaba y mudaba la venta. El resultado es que el inventario nunca se
// consolida y que dos ventas del mismo día pueden salir de estantes distintos
// sin que nadie lo decidiera.
//
// La política nueva ataca la causa: la mercancía se mueve, no la factura.
//
// La tienda ya publica la existencia SUMADA de las dos sucursales (ver
// `sellableByProduct`), así que el cliente puede pedir lo que hay en Cutis; lo
// que este módulo resuelve es cómo llega eso a la factura.

export interface OrderLineNeed {
  productId: string;
  qty: number;
}

/** Una línea que la sucursal de facturación no puede cubrir por sí sola. */
export interface MissingLine {
  productId: string;
  /** Lo que pidió el cliente. */
  needed: number;
  /** Lo que hay en la sucursal desde la que se factura. */
  available: number;
  /** Cuánto falta (`needed - available`). Siempre > 0. */
  missing: number;
  /**
   * De dónde puede salir lo que falta, de más a menos existencia. Vacío
   * significa que no está en ninguna sucursal: no hay transferencia que
   * resuelva esto, hay que comprar.
   */
  sources: { branchId: string; available: number }[];
}

/**
 * Qué le falta a la sucursal de facturación para despachar el pedido entero.
 *
 * Devuelve una lista vacía cuando puede con todo. Cada elemento dice **cuánto**
 * falta y **de dónde** puede salir, que es exactamente lo que el administrador
 * necesita para crear la transferencia sin tener que ir a buscarlo.
 *
 * `stockFor` desacopla esto del store de lotes del POS, que es lo que lo hace
 * probable sin montar medio inventario.
 */
export function missingForBilling(
  lines: readonly OrderLineNeed[],
  billingBranchId: string,
  otherBranchIds: readonly string[],
  stockFor: (productId: string, branchId: string) => number,
): MissingLine[] {
  const faltantes: MissingLine[] = [];

  for (const linea of lines) {
    const enSucursal = stockFor(linea.productId, billingBranchId);
    if (enSucursal >= linea.qty) continue;

    const sources = otherBranchIds
      .filter((id) => id !== billingBranchId)
      .map((id) => ({ branchId: id, available: stockFor(linea.productId, id) }))
      .filter((s) => s.available > 0)
      .sort((a, b) => b.available - a.available);

    faltantes.push({
      productId: linea.productId,
      needed: linea.qty,
      available: enSucursal,
      missing: linea.qty - enSucursal,
      sources,
    });
  }

  return faltantes;
}
