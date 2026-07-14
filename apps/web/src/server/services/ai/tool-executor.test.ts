import { describe, it, expect, vi, beforeEach } from "vitest";

const repos = {
  product: {
    list: vi.fn(),
    byId: vi.fn(),
    totalStock: vi.fn(),
  },
  productLot: { list: vi.fn() },
  customer: { list: vi.fn(), byId: vi.fn() },
  proforma: { listHeaders: vi.fn() },
};
vi.mock("@/server/repositories", () => ({ getRepositories: () => repos }));

import { chatToolSpecs, makeChatToolExecutor, CHAT_READ_TOOLS } from "./tool-executor";

const ctx = { businessId: "b1", branchId: "s1", userId: "u1" } as never;

beforeEach(() => vi.clearAllMocks());

describe("chatToolSpecs", () => {
  it("intersecta toolsAllowed con las de solo lectura (sin efecto por chat)", () => {
    const specs = chatToolSpecs([
      "search_products",
      "get_expiring_lots",
      "send_whatsapp_message", // efecto → fuera
      "handoff_to_human", // efecto → fuera
      "get_purchase_suggestions", // no registrada → fuera
    ]);
    expect(specs.map((s) => s.name).sort()).toEqual(["get_expiring_lots", "search_products"]);
    for (const s of specs) expect(CHAT_READ_TOOLS.has(s.name)).toBe(true);
  });
});

describe("makeChatToolExecutor", () => {
  it("search_products devuelve filas compactas", async () => {
    repos.product.list.mockResolvedValue([
      { id: "p1", sku: "S1", name: "Crema X", price: 100, unit: "unidad", cost: 1 },
    ]);
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "search_products", arguments: { query: "crema" } }));
    expect(repos.product.list).toHaveBeenCalledWith(ctx, { search: "crema", limit: 10, activeOnly: true });
    expect(out).toEqual([{ id: "p1", sku: "S1", name: "Crema X", price: 100, unit: "unidad" }]);
  });

  it("get_expiring_lots separa vencidos y por vencer, solo con stock", async () => {
    repos.productLot.list.mockImplementation(async (_c: never, opts: { expiredOnly?: boolean }) =>
      opts?.expiredOnly
        ? [
            { productId: "p1", lotNumber: "L1", expiresAt: "2026-01-01", currentQuantity: 4, status: "available" },
            { productId: "p1", lotNumber: "L0", expiresAt: "2025-12-01", currentQuantity: 0, status: "available" },
          ]
        : [{ productId: "p2", lotNumber: "L2", expiresAt: "2026-07-20", currentQuantity: 7, status: "available" }],
    );
    repos.product.byId.mockImplementation(async (_c: never, id: string) =>
      ({ p1: { name: "Crema X" }, p2: { name: "Serum Y" } })[id] ?? null,
    );
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "get_expiring_lots", arguments: {} }));
    expect(out.vencidos).toEqual([
      { product: "Crema X", lotNumber: "L1", expiresAt: "2026-01-01", currentQuantity: 4, status: "available" },
    ]);
    expect(out.vencidosTotal).toBe(1); // el lote sin stock no cuenta
    expect(out.porVencer[0]).toMatchObject({ product: "Serum Y", lotNumber: "L2" });
    expect(out.diasVentana).toBe(30);
  });

  it("errores del repo se devuelven como JSON de error (nunca lanza)", async () => {
    repos.product.list.mockRejectedValue(new Error("timeout de BD"));
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "search_products", arguments: { query: "x" } }));
    expect(out.error).toContain("timeout de BD");
  });

  it("tool desconocida responde error informativo", async () => {
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "send_whatsapp_message", arguments: {} }));
    expect(out.error).toContain("no disponible en este canal");
  });
});
