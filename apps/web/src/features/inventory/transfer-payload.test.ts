import { describe, it, expect } from "vitest";
import { buildTransferPayload } from "./transfer-payload";

const base = {
  transferNumber: "TRF-2026-00001",
  originBranchId: "b1",
  originWarehouseId: "wh1",
  destinationBranchId: "b2",
  destinationWarehouseId: "wh2",
  transferDate: "2026-07-16",
};

describe("buildTransferPayload", () => {
  it("arma header con snake_case y notes/created_by_name null si vacíos", () => {
    const p = buildTransferPayload({
      ...base,
      items: [{ lotId: "l1", productId: "pA", quantity: 2 }],
    });
    expect(p.header).toEqual({
      transfer_number: "TRF-2026-00001",
      origin_branch_id: "b1",
      origin_warehouse_id: "wh1",
      destination_branch_id: "b2",
      destination_warehouse_id: "wh2",
      transfer_date: "2026-07-16",
      notes: null,
      created_by_name: null,
    });
  });

  it("mapea items a snake_case y redondea la cantidad", () => {
    const p = buildTransferPayload({
      ...base,
      items: [
        { lotId: "l1", productId: "pA", quantity: 2.7 },
        { lotId: "l2", productId: "pB", quantity: 3 },
      ],
    });
    expect(p.items).toEqual([
      { lot_id: "l1", product_id: "pA", qty: 3 },
      { lot_id: "l2", product_id: "pB", qty: 3 },
    ]);
  });

  it("descarta ítems sin lote, sin producto o con qty<=0", () => {
    const p = buildTransferPayload({
      ...base,
      items: [
        { lotId: "", productId: "pA", quantity: 5 },
        { lotId: "l1", productId: "", quantity: 5 },
        { lotId: "l1", productId: "pA", quantity: 0 },
        { lotId: "l2", productId: "pB", quantity: -1 },
        { lotId: "l1", productId: "pA", quantity: 1 },
      ],
    });
    expect(p.items).toEqual([{ lot_id: "l1", product_id: "pA", qty: 1 }]);
  });

  it("conserva notes y created_by_name recortados", () => {
    const p = buildTransferPayload({
      ...base,
      notes: "  urgente  ",
      createdByName: "  Rosa  ",
      items: [{ lotId: "l1", productId: "pA", quantity: 1 }],
    });
    expect(p.header.notes).toBe("urgente");
    expect(p.header.created_by_name).toBe("Rosa");
  });
});
