import type { ProductLot } from "@/types";

export interface TransferPrefill {
  originBranchId: string;
  lotId: string;
}

export interface ResolveTransferPrefillArgs {
  productId: string;
  /** Sucursal actual (se prefiere como origen si tiene stock del producto). */
  currentBranchId?: string;
  /** Lotes de cualquier sucursal. */
  lots: ProductLot[];
}

/** FEFO: vencimiento más próximo primero. */
function byFefo(a: ProductLot, b: ProductLot): number {
  return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
}

/**
 * Elige sucursal origen y lote FEFO para prellenar una transferencia de un
 * producto (deep-link `?producto=`). Prefiere la sucursal actual si tiene stock;
 * si no, la sucursal con mayor stock disponible. Devuelve `null` si el producto
 * no tiene lotes disponibles en ninguna sucursal.
 */
export function resolveTransferPrefill(
  args: ResolveTransferPrefillArgs,
): TransferPrefill | null {
  const { productId, currentBranchId, lots } = args;

  const avail = lots.filter(
    (l) =>
      l.productId === productId &&
      l.status === "available" &&
      l.currentQuantity > 0,
  );
  if (avail.length === 0) return null;

  const byBranch = new Map<string, ProductLot[]>();
  for (const l of avail) {
    const arr = byBranch.get(l.branchId) ?? [];
    arr.push(l);
    byBranch.set(l.branchId, arr);
  }

  let chosenBranch: string | undefined;
  if (currentBranchId && byBranch.has(currentBranchId)) {
    chosenBranch = currentBranchId;
  } else {
    let best = -1;
    for (const [branchId, arr] of byBranch) {
      const total = arr.reduce((s, l) => s + l.currentQuantity, 0);
      if (total > best) {
        best = total;
        chosenBranch = branchId;
      }
    }
  }
  if (!chosenBranch) return null;

  const fefo = byBranch.get(chosenBranch)!.slice().sort(byFefo)[0]!;
  return { originBranchId: chosenBranch, lotId: fefo.id };
}
