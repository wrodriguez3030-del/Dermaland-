// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import type { Product } from "@/types";
import {
  createSession,
  getSession,
  listSessions,
  findProductByCode,
  applyScan,
  addManual,
  setItemQuantity,
  removeItem,
  setSessionStatus,
  sessionToCountData,
} from "./scan-session-store";

function product(p: Partial<Product>): Product {
  return {
    id: p.id ?? "p1",
    businessId: "biz",
    sku: p.sku ?? "SKU-1",
    barcode: p.barcode,
    name: p.name ?? "Crema",
    unit: "unidad",
    cost: p.cost ?? 100,
    price: 200,
    itbisRate: 18,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    createdAt: "",
    updatedAt: "",
  } as Product;
}

const PRODUCTS = [
  product({ id: "p1", sku: "SKU-1", barcode: "8400001", name: "Crema A" }),
  product({ id: "p2", sku: "SKU-2", barcode: "8400002", name: "Crema B" }),
];

beforeEach(() => {
  localStorage.clear();
});

function newSession() {
  return createSession({ name: "Inventario junio", branchId: "br1", type: "full", startedByName: "Carlos" });
}

describe("scan-session-store", () => {
  it("2. crea un inventario en progreso con código legible (sin UUID)", () => {
    const s = newSession();
    expect(s.status).toBe("in_progress");
    expect(s.code).toMatch(/^INV-\d{8}-[0-9A-Z]{4}$/);
    expect(listSessions()).toHaveLength(1);
  });

  it("3 y 4. encuentra producto por código de barra y por SKU", () => {
    expect(findProductByCode(PRODUCTS, "8400001")?.id).toBe("p1");
    expect(findProductByCode(PRODUCTS, "sku-2")?.id).toBe("p2"); // case-insensitive
    expect(findProductByCode(PRODUCTS, "nope")).toBeUndefined();
  });

  it("5 y 6. escaneo repetido suma cantidad sin crear filas duplicadas", () => {
    const s = newSession();
    applyScan(s.id, { scannedCode: "8400001", product: PRODUCTS[0] });
    applyScan(s.id, { scannedCode: "8400001", product: PRODUCTS[0] });
    const r = applyScan(s.id, { scannedCode: "8400001", product: PRODUCTS[0] });
    expect(r.result).toBe("duplicate_sum");
    const cur = getSession(s.id)!;
    expect(cur.items).toHaveLength(1); // una sola fila
    expect(cur.items[0]!.countedQuantity).toBe(3);
    expect(cur.scans).toHaveLength(3); // tres eventos
    expect(cur.scans[0]!.accumulated).toBe(3);
  });

  it("primer escaneo de un producto crea la fila con cantidad 1", () => {
    const s = newSession();
    const r = applyScan(s.id, { scannedCode: "8400002", product: PRODUCTS[1] });
    expect(r.result).toBe("found");
    expect(getSession(s.id)!.items[0]!.countedQuantity).toBe(1);
  });

  it("7. producto no encontrado se registra como 'no_encontrado' sin crear fila", () => {
    const s = newSession();
    const r = applyScan(s.id, { scannedCode: "9999", product: undefined });
    expect(r.result).toBe("not_found");
    const cur = getSession(s.id)!;
    expect(cur.items).toHaveLength(0);
    expect(cur.scans[0]!.result).toBe("not_found");
    expect(cur.scans[0]!.scannedCode).toBe("9999");
  });

  it("agrega manual y ajusta cantidades", () => {
    const s = newSession();
    addManual(s.id, { product: PRODUCTS[0]!, quantity: 5 });
    expect(getSession(s.id)!.items[0]!.countedQuantity).toBe(5);
    setItemQuantity(s.id, "p1", 8);
    expect(getSession(s.id)!.items[0]!.countedQuantity).toBe(8);
    removeItem(s.id, "p1");
    expect(getSession(s.id)!.items).toHaveLength(0);
  });

  it("un inventario aprobado ya no acepta escaneos", () => {
    const s = newSession();
    setSessionStatus(s.id, "approved");
    const r = applyScan(s.id, { scannedCode: "8400001", product: PRODUCTS[0] });
    expect(r.result).toBe("error");
    expect(getSession(s.id)!.items).toHaveLength(0);
  });

  it("8. calcula la diferencia (contado - sistema) al mapear al informe", () => {
    const s = newSession();
    applyScan(s.id, { scannedCode: "8400001", product: PRODUCTS[0] }); // contado 1
    addManual(s.id, { product: PRODUCTS[1]!, quantity: 10 }); // contado 10
    const { items } = sessionToCountData(getSession(s.id)!, {
      systemQuantityFor: (pid) => (pid === "p1" ? 5 : 4), // sistema p1=5, p2=4
    });
    const byId = Object.fromEntries(items.map((it) => [it.productId, it]));
    expect(byId["p1"]!.differenceQuantity).toBe(-4); // 1 - 5 (faltante)
    expect(byId["p1"]!.status).toBe("shortage");
    expect(byId["p2"]!.differenceQuantity).toBe(6); // 10 - 4 (sobrante)
    expect(byId["p2"]!.status).toBe("overage");
  });
});
