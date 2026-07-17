import { describe, expect, it } from "vitest";
import { aggregateLotBuyers, type LotBuyerRow } from "./lot-buyers";

const rows: LotBuyerRow[] = [
  { customerId: "c1", customerName: "Ana", phone: "809-111-1111", quantity: 2, date: "2026-06-01T10:00:00Z", proformaNumber: "P-001" },
  { customerId: "c1", customerName: "Ana", phone: "809-111-1111", quantity: 3, date: "2026-06-10T10:00:00Z", proformaNumber: "P-009" },
  { customerId: "c2", customerName: "Luis", phone: "", quantity: 1, date: "2026-06-05T10:00:00Z", proformaNumber: "P-005" },
];

describe("aggregateLotBuyers", () => {
  it("agrupa por cliente: suma cantidad, cuenta compras y toma la última fecha", () => {
    const out = aggregateLotBuyers(rows);
    const ana = out.find((b) => b.customerId === "c1")!;
    expect(ana.totalQuantity).toBe(5);
    expect(ana.purchaseCount).toBe(2);
    expect(ana.lastPurchase).toBe("2026-06-10T10:00:00Z");
    expect(ana.phone).toBe("809-111-1111");
  });

  it("ordena por cantidad total descendente", () => {
    const out = aggregateLotBuyers(rows);
    expect(out.map((b) => b.customerId)).toEqual(["c1", "c2"]);
  });

  it("cliente sin teléfono queda con phone vacío (no rompe)", () => {
    const luis = aggregateLotBuyers(rows).find((b) => b.customerId === "c2")!;
    expect(luis.phone).toBe("");
    expect(luis.totalQuantity).toBe(1);
  });

  it("lista vacía → []", () => {
    expect(aggregateLotBuyers([])).toEqual([]);
  });
});
