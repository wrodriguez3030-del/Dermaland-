import { describe, it, expect } from "vitest";
import { applyTransferScan, type TransferRow } from "./transfer-scan";
import type { Product, ProductLot } from "@/types";

// ── Fixtures mínimos (solo los campos que usa la lógica) ─────────────────────
function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    sku: `SKU-${id}`,
    barcode: `BC-${id}`,
    name: `Producto ${id}`,
    unit: "unidad",
    requiresPrescription: false,
    controlled: false,
    cost: 0,
    price: 0,
    itbisRate: 0,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    businessId: "biz",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  } as Product;
}

function lot(
  id: string,
  productId: string,
  qty: number,
  expiresAt: string,
): ProductLot {
  return {
    id,
    productId,
    warehouseId: "wh1",
    lotNumber: `L-${id}`,
    expiresAt,
    receivedAt: "2026-01-01",
    initialQuantity: qty,
    currentQuantity: qty,
    unitCost: 0,
    status: "available",
    branchId: "origin",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as ProductLot;
}

const products = [product("A"), product("B")];
const emptyRows: TransferRow[] = [{ lotId: "", quantity: "" }];

describe("applyTransferScan", () => {
  it("sin origen seleccionado devuelve no_origin", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: false,
      rows: emptyRows,
      availableLots: [],
      products,
    });
    expect(r.result).toBe("no_origin");
  });

  it("código en blanco devuelve empty", () => {
    const r = applyTransferScan({
      code: "   ",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r.result).toBe("empty");
  });

  it("código desconocido devuelve not_found", () => {
    const r = applyTransferScan({
      code: "NO-EXISTE",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r).toMatchObject({ result: "not_found", code: "NO-EXISTE" });
  });

  it("producto sin lotes en origen devuelve no_stock", () => {
    const r = applyTransferScan({
      code: "BC-B",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r.result).toBe("no_stock");
  });

  it("agrega el lote FEFO en la fila vacía con cantidad 1", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: emptyRows,
      availableLots: [
        lot("late", "A", 5, "2027-01-01"),
        lot("fefo", "A", 5, "2026-06-01"),
      ],
      products,
    });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.lot.id).toBe("fefo"); // vencimiento más próximo
      expect(r.quantity).toBe(1);
      expect(r.rows[0]).toEqual({ lotId: "fefo", quantity: "1" });
      // No debe agregar filas nuevas: reutiliza la vacía.
      expect(r.rows).toHaveLength(1);
    }
  });

  it("agrega una fila nueva si no hay filas vacías", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "otro", quantity: "2" }],
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.rows).toHaveLength(2);
      expect(r.rows[1]).toEqual({ lotId: "l1", quantity: "1" });
    }
  });

  it("escaneo repetido incrementa la cantidad de la fila existente", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "l1", quantity: "1" }],
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("incremented");
    if (r.result === "incremented") {
      expect(r.quantity).toBe(2);
      expect(r.rows[0]).toEqual({ lotId: "l1", quantity: "2" });
    }
  });

  it("no supera el stock del lote: topa en el máximo (at_max)", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "l1", quantity: "3" }],
      availableLots: [lot("l1", "A", 3, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("at_max");
    if (r.result === "at_max") {
      expect(r.quantity).toBe(3);
      expect(r.rows[0]).toEqual({ lotId: "l1", quantity: "3" });
    }
  });

  it("matchea también por SKU (case-insensitive)", () => {
    const r = applyTransferScan({
      code: "sku-a",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("added");
  });
});
