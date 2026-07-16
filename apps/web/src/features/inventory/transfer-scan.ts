import type { Product, ProductLot } from "@/types";
import { findProductByCode } from "@/features/inventory-counts/scan-session-store";

/** Fila de la tabla de transferencia (producto+cantidad como string editable). */
export interface TransferRow {
  lotId: string;
  quantity: string;
}

export type TransferScanOutcome =
  | { result: "no_origin" }
  | { result: "empty" }
  | { result: "not_found"; code: string }
  | { result: "no_stock"; product: Product }
  | {
      result: "added" | "incremented" | "at_max";
      product: Product;
      lot: ProductLot;
      rows: TransferRow[];
      quantity: number;
    };

export interface ApplyTransferScanArgs {
  /** Código crudo escaneado o escrito. */
  code: string;
  /** Si hay sucursal origen seleccionada. */
  originSelected: boolean;
  /** Filas actuales de la tabla. */
  rows: TransferRow[];
  /** Lotes `available` de la sucursal origen con `currentQuantity > 0`. */
  availableLots: ProductLot[];
  /** Catálogo local (misma fuente que availableLots) para matchear el código. */
  products: Product[];
}

/** FEFO: vencimiento más próximo primero. */
function byFefo(a: ProductLot, b: ProductLot): number {
  return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
}

/**
 * Resuelve un escaneo en la pantalla de transferencia: código → producto →
 * lote FEFO en el origen → nuevas filas. Función pura (sin efectos): la página
 * aplica `outcome.rows` y muestra el feedback según `outcome.result`.
 */
export function applyTransferScan(args: ApplyTransferScanArgs): TransferScanOutcome {
  const { originSelected, products, availableLots, rows } = args;
  const code = args.code.trim();

  if (!originSelected) return { result: "no_origin" };
  if (!code) return { result: "empty" };

  const product = findProductByCode(products, code);
  if (!product) return { result: "not_found", code };

  const lots = availableLots
    .filter((l) => l.productId === product.id)
    .sort(byFefo);
  if (lots.length === 0) return { result: "no_stock", product };

  // ¿Ya hay una fila con un lote de este producto? → incrementar.
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const existingIdx = rows.findIndex((r) => lotById.has(r.lotId));

  if (existingIdx >= 0) {
    const row = rows[existingIdx]!;
    const lot = lotById.get(row.lotId)!;
    const current = Number(row.quantity) || 0;
    const next = current + 1;
    if (next > lot.currentQuantity) {
      const capped = lot.currentQuantity;
      const cappedRows = rows.map((r, i) =>
        i === existingIdx ? { ...r, quantity: String(capped) } : r,
      );
      return { result: "at_max", product, lot, rows: cappedRows, quantity: capped };
    }
    const nextRows = rows.map((r, i) =>
      i === existingIdx ? { ...r, quantity: String(next) } : r,
    );
    return { result: "incremented", product, lot, rows: nextRows, quantity: next };
  }

  // Nueva entrada: lote FEFO en la primera fila vacía, o fila nueva.
  const fefo = lots[0]!;
  const emptyIdx = rows.findIndex((r) => !r.lotId);
  const nextRows =
    emptyIdx >= 0
      ? rows.map((r, i) =>
          i === emptyIdx ? { ...r, lotId: fefo.id, quantity: "1" } : r,
        )
      : [...rows, { lotId: fefo.id, quantity: "1" }];
  return { result: "added", product, lot: fefo, rows: nextRows, quantity: 1 };
}
