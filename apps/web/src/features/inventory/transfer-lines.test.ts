import { describe, it, expect } from "vitest";
import { addProductLine, type TransferLine } from "./transfer-lines";
import type { ProductLot } from "@/types";

function lot(id: string, qty: number, expiresAt: string): ProductLot {
  return {
    id,
    productId: "A",
    branchId: "origin",
    warehouseId: "wh1",
    lotNumber: `L-${id}`,
    expiresAt,
    receivedAt: "2026-01-01",
    initialQuantity: qty,
    currentQuantity: qty,
    unitCost: 0,
    status: "available",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as ProductLot;
}

const product = { id: "A", name: "Producto A" };

describe("addProductLine", () => {
  it("sin lotes devuelve no_stock", () => {
    expect(addProductLine({ lines: [], product, lots: [] }).result).toBe("no_stock");
  });

  it("agrega una línea nueva con el lote FEFO y cantidad 1", () => {
    const r = addProductLine({
      lines: [],
      product,
      lots: [lot("late", 5, "2027-01-01"), lot("fefo", 5, "2026-06-01")],
    });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.lot.id).toBe("fefo");
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toEqual({
        productId: "A",
        productName: "Producto A",
        lotId: "fefo",
        quantity: "1",
      });
    }
  });

  it("incrementa la línea existente del producto", () => {
    const lines: TransferLine[] = [
      { productId: "A", productName: "Producto A", lotId: "l1", quantity: "1" },
    ];
    const r = addProductLine({ lines, product, lots: [lot("l1", 5, "2026-06-01")] });
    expect(r.result).toBe("incremented");
    if (r.result === "incremented") {
      expect(r.quantity).toBe(2);
      expect(r.lines[0]!.quantity).toBe("2");
    }
  });

  it("no supera el stock del lote (at_max)", () => {
    const lines: TransferLine[] = [
      { productId: "A", productName: "Producto A", lotId: "l1", quantity: "3" },
    ];
    const r = addProductLine({ lines, product, lots: [lot("l1", 3, "2026-06-01")] });
    expect(r.result).toBe("at_max");
    if (r.result === "at_max") {
      expect(r.quantity).toBe(3);
      expect(r.lines[0]!.quantity).toBe("3");
    }
  });

  it("no toca otras líneas de otros productos", () => {
    const lines: TransferLine[] = [
      { productId: "B", productName: "Producto B", lotId: "lb", quantity: "2" },
    ];
    const r = addProductLine({ lines, product, lots: [lot("l1", 5, "2026-06-01")] });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.lines).toHaveLength(2);
      expect(r.lines[0]).toEqual(lines[0]);
    }
  });
});
