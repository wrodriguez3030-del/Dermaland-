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

export interface PickBillingBranchOptions {
  /**
   * Sucursal con derecho a ganar los empates: aquella a la que el cliente **va
   * a ir**. Solo existe en un retiro.
   *
   * En un **envío no hay ninguna**. El cliente no pisa una sucursal; la que
   * quedó guardada en el pedido es la que la tienda eligió por defecto y no
   * significa nada. Privilegiarla fue justo lo que dejó el POS abierto en
   * "Cutis" —cero lotes— con el carrito vacío.
   */
  stickyBranchId?: string;
}

/**
 * La sucursal desde la que conviene facturar.
 *
 * Gana la que cubre más líneas enteras. En un retiro, la sucursal del cliente
 * gana los empates: si puede hacerlo igual de bien, no hay motivo para mover la
 * venta de donde él quedó en pasar a buscarla. En un envío no hay empate que
 * proteger y gana la que más cubra; a igualdad, la primera de la lista — por eso
 * `candidateBranchIds` debe venir ordenada por existencia, de más a menos.
 *
 * `stockFor` desacopla esto del store de lotes del POS, que es lo que lo hace
 * probable sin montar medio inventario.
 */
export function pickBillingBranch(
  lines: readonly OrderLineNeed[],
  orderBranchId: string,
  candidateBranchIds: readonly string[],
  stockFor: (productId: string, branchId: string) => number,
  options: PickBillingBranchOptions = {},
): BranchPick {
  const cobertura = (branchId: string) =>
    lines.filter((l) => stockFor(l.productId, branchId) >= l.qty).length;

  const sticky = options.stickyBranchId;

  // El punto de partida: la sucursal del cliente si existe, y si no la primera
  // candidata —la de más existencia—. Nunca la del pedido a secas: en un envío
  // esa sucursal es la que puso la tienda por defecto y no significa nada.
  let mejorId = sticky ?? candidateBranchIds[0] ?? orderBranchId;
  let mejor = cobertura(mejorId);

  // Si el punto de partida lo cubre todo, no hay nada que decidir.
  if (lines.length > 0 && mejor === lines.length) {
    return { branchId: mejorId, covered: mejor, changed: mejorId !== orderBranchId };
  }

  // Con sucursal designada, moverse es una RED DE SEGURIDAD, no una
  // optimización: solo si ahí no se puede despachar ni una sola línea. Que la
  // facturación se mude sola porque otra sucursal cubre una línea más sería un
  // cambio en silencio de una decisión que tomó el negocio.
  const soloSiVacia = sticky !== undefined;
  if (soloSiVacia && mejor > 0) {
    return { branchId: mejorId, covered: mejor, changed: mejorId !== orderBranchId };
  }

  for (const id of candidateBranchIds) {
    if (id === mejorId) continue;
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
