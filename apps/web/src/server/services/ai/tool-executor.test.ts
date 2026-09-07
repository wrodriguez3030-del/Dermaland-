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

// El histórico migrado de Alegra llega YA SUMADO por la base (la misma llamada
// que usa el panel). Se moquea porque `get_sales_summary` la importa en
// caliente, igual que `get_receivables` importa su servicio.
const resumenVentas = vi.fn();
vi.mock("@/server/repositories/supabase/ventas-unificadas", () => ({
  resumenVentas: (...args: unknown[]) => resumenVentas(...args),
}));

/** Resumen con las cifras reales de producción: 14 743 facturas migradas. */
const RESUMEN_CON_HISTORICO = {
  total: 48454899.08,
  cantidad: 14743,
  porOrigen: {
    sistema: { total: 0, cantidad: 0 },
    alegra: { total: 48454899.08, cantidad: 14743 },
  },
};

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
  it("search_products separa disponibles (con stock) de agotados — solo se recomienda lo disponible", async () => {
    repos.product.list.mockResolvedValue([
      { id: "p1", sku: "S1", name: "Crema X", price: 100, unit: "unidad", cost: 1 },
      { id: "p2", sku: "S2", name: "Serum Y", price: 200, unit: "unidad", cost: 2 },
    ]);
    repos.product.totalStock.mockImplementation(async (_c: never, id: string) => (id === "p1" ? 12 : 0));
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "search_products", arguments: { query: "crema" } }));
    expect(repos.product.list).toHaveBeenCalledWith(ctx, { search: "crema", limit: 10, activeOnly: true });
    expect(out.disponibles).toEqual([
      { id: "p1", sku: "S1", name: "Crema X", price: 100, unit: "unidad", stock: 12 },
    ]);
    expect(out.agotados).toEqual(["Serum Y"]); // solo el nombre: no ofrecible
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

  it("get_sales_summary sanea parámetros inventados (regresión 22P02/22007)", async () => {
    repos.proforma.listHeaders.mockResolvedValue([
      { status: "paid", total: 1000 },
      { status: "cancelled", total: 400 },
    ]);
    resumenVentas.mockResolvedValue(RESUMEN_CON_HISTORICO);
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({
      name: "get_sales_summary",
      arguments: { from: "este-mes", to: "2026-07-31", branch_id: "principal" },
    }));
    // "este-mes" y "principal" NO llegan a la BD; la fecha válida sí. Y no solo
    // al repositorio de proformas: el saneado tiene que valer también para la
    // consulta del histórico, que es una segunda puerta a Postgres.
    expect(repos.proforma.listHeaders).toHaveBeenCalledWith(ctx, {
      from: undefined, to: "2026-07-31", branchId: undefined,
    });
    expect(resumenVentas).toHaveBeenCalledWith(ctx, { hasta: "2026-07-31" });
    expect(out.porOrigen.sistema.ventas).toBe(1);
    expect(out.porOrigen.sistema.totalDOP).toBe(1000);
    expect(out.aviso).toContain("from inválido");
  });

  it("🔴 get_sales_summary cuenta el histórico migrado, no solo las proformas", async () => {
    // El fallo real: el dueño preguntaba «¿cuánto vendimos?» y el asistente
    // contestaba «0 ventas · RD$0.00» mientras el panel enseñaba
    // RD$48 454 899,08 — y en el MISMO fichero `get_receivables` sí incluía
    // Alegra. Dos criterios opuestos en la misma conversación.
    repos.proforma.listHeaders.mockResolvedValue([]);
    resumenVentas.mockResolvedValue(RESUMEN_CON_HISTORICO);
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "get_sales_summary", arguments: {} }));
    expect(out.historicoIncluido).toBe(true);
    expect(out.ventas).toBe(14743);
    expect(out.totalDOP).toBeCloseTo(48454899.08, 2);
    // El total mezcla dos fuentes: tiene que decir cuánto pone cada una.
    expect(out.porOrigen.alegra).toEqual({ ventas: 14743, totalDOP: 48454899.08 });
    expect(out.porOrigen.sistema).toEqual({ ventas: 0, totalDOP: 0 });
  });

  it("🔴 sin el histórico NO devuelve un total: avisa de que la cifra es parcial", async () => {
    // Es el camino de HOY: la migración `20260906130000` no está aplicada, así
    // que la función SQL no existe. En este canal no hay aviso ámbar ni
    // etiqueta de origen: si saliera un `totalDOP` a secas, el modelo lo
    // afirmaría como el total del negocio faltando RD$48,4 millones.
    repos.proforma.listHeaders.mockResolvedValue([{ status: "paid", total: 1000 }]);
    resumenVentas.mockRejectedValue(new Error("la función resumen_ventas_unificadas no existe"));
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "get_sales_summary", arguments: {} }));
    expect(out.historicoIncluido).toBe(false);
    expect(out.totalDOP).toBeUndefined();
    expect(out.ventas).toBeUndefined();
    expect(out.totalSistemaDOP).toBe(1000);
    expect(out.aviso_historico).toContain("incompletas");
  });

  it("🔴 get_sales_summary usa el criterio del PANEL, no «todo lo que no sea cancelled»", async () => {
    // El criterio viejo (`status !== "cancelled"`) era un cuarto criterio: no
    // excluía `voided`, `draft` ni `expired`, contaba proformas `pending` que
    // el panel NO cuenta, y llamaba «anuladas» a la diferencia.
    repos.proforma.listHeaders.mockResolvedValue([
      { status: "paid", total: 1000 },
      { status: "issued", total: 500 },
      { status: "pending", total: 700 }, // todavía no es una venta
      { status: "draft", total: 300 }, // borrador
      { status: "voided", total: 900 }, // anulada en la BD
    ]);
    resumenVentas.mockResolvedValue({
      total: 0, cantidad: 0,
      porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
    });
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "get_sales_summary", arguments: {} }));
    expect(out.porOrigen.sistema).toEqual({ ventas: 2, totalDOP: 1500 });
    // `anuladas` significa anuladas: `draft` y `voided`, no «lo que sobra».
    expect(out.anuladasSistema).toBe(2);
  });

  it("search_products reintenta sin acentos y por palabra más distintiva (regresión Rilastil)", async () => {
    // "Xerolact Bálsamo" no matchea ILIKE la frase; el 3er intento ("Xerolact") sí.
    repos.product.list
      .mockResolvedValueOnce([]) // frase completa
      .mockResolvedValueOnce([]) // sin acentos
      .mockResolvedValueOnce([{ id: "p9", sku: "S9", name: "Rilastil Xerolact PB Balsamo", price: 900, unit: "unidad" }]);
    repos.product.totalStock.mockResolvedValue(0);
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({ name: "search_products", arguments: { query: "Xerolact Bálsamo" } }));
    expect(repos.product.list).toHaveBeenNthCalledWith(2, ctx, { search: "Xerolact Balsamo", limit: 10, activeOnly: true });
    expect(repos.product.list).toHaveBeenNthCalledWith(3, ctx, { search: "Xerolact", limit: 10, activeOnly: true });
    expect(out.agotados).toEqual(["Rilastil Xerolact PB Balsamo"]); // existe pero sin stock
    expect(out.disponibles).toEqual([]);
  });

  it("get_product_lots pide el tope a la CONSULTA, no descarga para tirar filas", async () => {
    repos.productLot.list.mockResolvedValue([]);
    const exec = makeChatToolExecutor(ctx);
    await exec({
      name: "get_product_lots",
      arguments: { product_id: "11111111-2222-3333-4444-555555555555" },
    });
    expect(repos.productLot.list).toHaveBeenCalledWith(ctx, {
      productId: "11111111-2222-3333-4444-555555555555",
      limit: 25,
    });
  });

  it("🔴 get_expiring_lots NO lleva tope: sus totales se cuentan sobre el conjunto entero", async () => {
    // Guarda deliberada. `vencidosTotal`/`porVencerTotal` cuentan estas filas;
    // ponerle `limit` haría que dijeran «25 vencidos» habiendo 300, en
    // silencio. El arreglo bueno es una consulta de conteo (anotado en
    // `docs/proximos-pasos.md`), no un tope aquí. Si esta prueba se pone roja
    // porque alguien añadió `limit`, el número que se rompió es un total.
    repos.productLot.list.mockResolvedValue([]);
    const exec = makeChatToolExecutor(ctx);
    await exec({ name: "get_expiring_lots", arguments: {} });
    for (const llamada of repos.productLot.list.mock.calls) {
      expect(llamada[1]).not.toHaveProperty("limit");
    }
  });

  it("get_inventory_stock con id no-UUID devuelve guía en vez de romper la query", async () => {
    const exec = makeChatToolExecutor(ctx);
    const out = JSON.parse(await exec({
      name: "get_inventory_stock",
      arguments: { product_id: "shampoo" },
    }));
    expect(out.error).toContain("search_products");
    expect(repos.product.totalStock).not.toHaveBeenCalled();
  });
});
