// Lo que hay que saber de una línea del pedido ANTES de confirmarlo.
//
// El detalle del pedido decía "comprueba que hay existencia real" y ahí acababa
// su ayuda: quien confirmaba tenía que abrir el inventario en otra pestaña,
// buscar cada producto y volver. Con seis líneas, nadie lo hace.
//
// Aquí se responde lo que de verdad se pregunta: ¿está?, ¿está DONDE hay que
// despacharlo?, y si no, ¿dónde está.

import type { WebAvailability } from "../stock";

export type LineStockTone = "ok" | "warn" | "bad";

export interface LineStockVerdict {
  tone: LineStockTone;
  /** Frase corta para el badge de la línea. */
  label: string;
  /** Dónde está lo que falta. Vacío si no falta nada o no hay en ningún sitio. */
  hint?: string;
}

/**
 * ¿Se puede despachar esta línea desde su sucursal?
 *
 * Tres respuestas, y las tres son distintas para quien trabaja:
 *
 *   · **ok** — está en la sucursal que despacha. No hay nada que hacer.
 *   · **warn** — hay en el negocio pero no ahí. Se resuelve con una
 *     transferencia, así que la frase dice de dónde traerlo.
 *   · **bad** — no hay en ninguna parte. Hay que llamar al cliente.
 *
 * `available` ya trae restado lo apalabrado en OTROS pedidos web; la existencia
 * por sucursal es la física, porque una transferencia se hace con lo que hay en
 * el estante, no con lo que queda libre.
 */
export function lineStockVerdict(
  qty: number,
  disponible: WebAvailability | undefined,
  branchId: string,
  branchNames: ReadonlyMap<string, string>,
): LineStockVerdict {
  const d = disponible;
  if (!d || d.physical === 0) {
    return { tone: "bad", label: "Sin existencia" };
  }

  const enSucursal = d.byBranch.get(branchId) ?? 0;
  if (enSucursal >= qty && d.available >= qty) {
    return { tone: "ok", label: `Hay ${enSucursal} aquí` };
  }

  const otras = [...d.byBranch.entries()]
    .filter(([id, n]) => id !== branchId && n > 0)
    .map(([id, n]) => `${branchNames.get(id) ?? "otra sucursal"} (${n})`);

  // Hay mercancía, pero está apalabrada a otros pedidos web sin facturar.
  if (d.available < qty && d.physical >= qty) {
    return {
      tone: "warn",
      label: `Quedan ${d.available} libres de ${d.physical}`,
      hint: `${d.committed} ${d.committed === 1 ? "unidad está" : "unidades están"} apalabradas a otros pedidos web sin facturar.`,
    };
  }

  if (enSucursal === 0) {
    return {
      tone: "warn",
      label: "No está en esta sucursal",
      hint: otras.length > 0 ? `Hay en: ${otras.join(", ")}.` : undefined,
    };
  }

  return {
    tone: "warn",
    label: `Solo ${enSucursal} de ${qty} aquí`,
    hint: otras.length > 0 ? `Hay en: ${otras.join(", ")}.` : undefined,
  };
}

/** ¿Se puede despachar el pedido entero sin mover nada? */
export function orderCanBeFulfilled(
  verdicts: readonly LineStockVerdict[],
): boolean {
  return verdicts.length > 0 && verdicts.every((v) => v.tone === "ok");
}
