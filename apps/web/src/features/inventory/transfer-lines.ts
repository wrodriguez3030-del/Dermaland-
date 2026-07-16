import type { ProductLot } from "@/types";

/** Una línea de transferencia: un producto + el lote elegido + cantidad. */
export interface TransferLine {
  productId: string;
  productName: string;
  lotId: string;
  quantity: string;
}

export interface ProductLite {
  id: string;
  name: string;
}

export type AddProductLineOutcome =
  | { result: "no_stock" }
  | {
      result: "added" | "incremented" | "at_max";
      lines: TransferLine[];
      lot: ProductLot;
      quantity: number;
    };

/** FEFO: vencimiento más próximo primero. */
function byFefo(a: ProductLot, b: ProductLot): number {
  return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
}

/**
 * Agrega (o incrementa) una línea para `product`. `lots` son los lotes de ESE
 * producto en la sucursal origen (available, qty > 0). Función pura.
 *
 * - Sin lotes → `no_stock`.
 * - Ya hay línea del producto → +1 en su lote actual, topando en el stock del
 *   lote (`at_max`) o incrementando (`incremented`).
 * - No hay línea → agrega una nueva con el lote FEFO, cantidad 1 (`added`).
 */
export function addProductLine(args: {
  lines: TransferLine[];
  product: ProductLite;
  lots: ProductLot[];
}): AddProductLineOutcome {
  const lots = [...args.lots].sort(byFefo);
  if (lots.length === 0) return { result: "no_stock" };

  const idx = args.lines.findIndex((l) => l.productId === args.product.id);
  if (idx >= 0) {
    const line = args.lines[idx]!;
    const lot = lots.find((l) => l.id === line.lotId) ?? lots[0]!;
    const current = Number(line.quantity) || 0;
    const next = current + 1;
    if (next > lot.currentQuantity) {
      const capped = lot.currentQuantity;
      const lines = args.lines.map((l, i) =>
        i === idx ? { ...l, quantity: String(capped) } : l,
      );
      return { result: "at_max", lines, lot, quantity: capped };
    }
    const lines = args.lines.map((l, i) =>
      i === idx ? { ...l, quantity: String(next) } : l,
    );
    return { result: "incremented", lines, lot, quantity: next };
  }

  const fefo = lots[0]!;
  const lines = [
    ...args.lines,
    {
      productId: args.product.id,
      productName: args.product.name,
      lotId: fefo.id,
      quantity: "1",
    },
  ];
  return { result: "added", lines, lot: fefo, quantity: 1 };
}
