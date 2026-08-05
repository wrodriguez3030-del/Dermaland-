// ¿Desde qué sucursal se factura este pedido web?
//
// La respuesta obvia —la del pedido— resulta ser la equivocada más veces de lo
// que parece. En esta base, la sucursal "Cutis" está anunciada en la tienda y
// tiene **cero lotes**: todo el inventario vive en "DermaLand Principal". El
// cliente que elige Cutis para retirar está pidiendo en un sitio donde no hay
// nada, y la tienda se lo permite.
//
// Si el POS se abriera obedientemente en la sucursal del pedido, el cajero
// vería un carrito vacío con dos avisos y tendría que teclearlo todo a mano.
// Así que se busca la sucursal que de verdad puede despachar, se factura desde
// ahí y se DICE que se cambió. Nunca en silencio: quien cobra tiene que saber
// de qué estante sale la mercancía.
//
// Solo aplica si el usuario puede elegir sucursal (admin/manager). Para el
// resto la sucursal es la suya y punto.

export interface BranchPick {
  branchId: string;
  /** Cuántas líneas del pedido puede cubrir entera esa sucursal. */
  covered: number;
  /** `true` si no es la del pedido: hay que decirlo en pantalla. */
  changed: boolean;
}

export interface OrderLineNeed {
  productId: string;
  qty: number;
}

/**
 * La sucursal desde la que conviene facturar.
 *
 * Gana la que cubre más líneas enteras. **La del pedido gana los empates**: si
 * puede hacerlo igual de bien, no hay motivo para moverse de donde el cliente
 * quedó en pasar a buscarlo.
 *
 * `stockFor` desacopla esto del store de lotes del POS, que es lo que lo hace
 * probable sin montar medio inventario.
 */
export function pickBillingBranch(
  lines: readonly OrderLineNeed[],
  orderBranchId: string,
  candidateBranchIds: readonly string[],
  stockFor: (productId: string, branchId: string) => number,
): BranchPick {
  const cobertura = (branchId: string) =>
    lines.filter((l) => stockFor(l.productId, branchId) >= l.qty).length;

  const delPedido = cobertura(orderBranchId);
  // Si la del pedido lo cubre todo, no hay nada que decidir.
  if (lines.length > 0 && delPedido === lines.length) {
    return { branchId: orderBranchId, covered: delPedido, changed: false };
  }

  let mejorId = orderBranchId;
  let mejor = delPedido;
  for (const id of candidateBranchIds) {
    if (id === orderBranchId) continue;
    const n = cobertura(id);
    // `>` estricto: empatar no basta para mover la venta de sitio.
    if (n > mejor) {
      mejor = n;
      mejorId = id;
    }
  }

  return {
    branchId: mejorId,
    covered: mejor,
    changed: mejorId !== orderBranchId,
  };
}
