import { describe, it, expect } from "vitest";
import { buildCountCreatePayload } from "./persist";
import type { CountSession } from "./scan-session-store";

const session = {
  id: "sess_1",
  code: "INV-20260711-AB12",
  name: "Conteo total",
  branchId: "br_santiago",
  type: "full",
  status: "reviewing",
  notes: "nota",
  startedAt: "2026-07-11T09:00:00Z",
  items: [
    { productId: "p1", sku: "SKU-1", productName: "Crema A", countedQuantity: 8, lastScannedAt: "2026-07-11T10:00:00Z" },
    { productId: "p2", sku: "SKU-2", productName: "Crema B", countedQuantity: 5, lastScannedAt: "2026-07-11T10:05:00Z" },
    { productId: "p3", sku: "SKU-3", productName: "Crema C", countedQuantity: 12, lastScannedAt: "2026-07-11T10:10:00Z" },
  ],
  scans: [],
  createdAt: "2026-07-11T09:00:00Z",
  updatedAt: "2026-07-11T10:10:00Z",
} as unknown as CountSession;

// Stock de sistema: p1=10 (faltan 2), p2=5 (coincide), p3=9 (sobran 3)
const systemQtyFor = (id: string) => ({ p1: 10, p2: 5, p3: 9 }[id] ?? 0);

describe("buildCountCreatePayload", () => {
  it("mapea cabecera desde la sesión", () => {
    const p = buildCountCreatePayload(session, systemQtyFor, "adjusted");
    expect(p.countNumber).toBe("INV-20260711-AB12");
    expect(p.branchId).toBe("br_santiago");
    expect(p.countType).toBe("full");
    expect(p.status).toBe("adjusted");
    expect(p.notes).toBe("nota");
    expect(p.startedAt).toBe("2026-07-11T09:00:00Z");
    expect(p.items).toHaveLength(3);
  });

  it("calcula esperado, diferencia y estado por ítem", () => {
    const p = buildCountCreatePayload(session, systemQtyFor, "approved");
    const byId = Object.fromEntries(p.items.map((i) => [i.productSku, i]));
    expect(byId["SKU-1"]).toMatchObject({
      expectedQuantity: 10,
      countedQuantity: 8,
      differenceQuantity: -2,
      status: "shortage",
    });
    expect(byId["SKU-2"]).toMatchObject({ differenceQuantity: 0, status: "match" });
    expect(byId["SKU-3"]).toMatchObject({
      expectedQuantity: 9,
      differenceQuantity: 3,
      status: "overage",
    });
  });
});
