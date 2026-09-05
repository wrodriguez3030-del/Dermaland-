import { describe, it, expect } from "vitest";
import { planProducts, type ExistingProduct, type ProductAction } from "./plan-products";
import type { AlegraItem } from "./types";

const it_ = (over: Partial<AlegraItem>): AlegraItem => ({
  id: "1",
  name: "ELTA MD UV SPORT BROAD SPECTRUM SPF 50",
  status: "active",
  price: [{ idPriceList: "1", name: "General", price: 1779.661, main: true }],
  inventory: { unitCost: 1156.78, warehouses: [] },
  customFields: [{ key: "barcode", value: "390205022878" }],
  tax: [{ percentage: "18.00" }],
  ...over,
});
const ex = (over: Partial<ExistingProduct>): ExistingProduct => ({
  id: "p1",
  name: "Elta MD UV Sport Broad Spectrum SPF 50",
  alegraId: null,
  barcode: "0390205022878",
  cost: 1156.78,
  price: 2100,
  itbisRate: 18,
  active: true,
  ...over,
});

describe("planProducts", () => {
  it("empareja por nombre normalizado, guarda alegra_id y no toca nada más si todo coincide", () => {
    const p = planProducts([it_({})], [ex({})], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", productId: "p1", patch: { alegra_id: "1" } });
    expect(Object.keys((p.actions[0] as Extract<ProductAction, { kind: "update" }>).patch)).toEqual(["alegra_id"]);
    expect(p.matchedByName).toBe(1);
    expect(p.priceChanged).toBe(0);
  });

  it("empareja por alegra_id aunque el nombre cambie, y renombra con nombre limpio", () => {
    const p = planProducts([it_({ name: "ELTA MD UV SPORT SPF 50 NUEVO" })], [ex({ alegraId: "1" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", patch: { name: "Elta MD UV Sport SPF 50 Nuevo" } });
  });

  it("el ITBIS del producto también manda desde Alegra", () => {
    const exento = planProducts([it_({ tax: [] })], [ex({ alegraId: "1", itbisRate: 18, price: 2100 })], null);
    expect(exento.actions[0]).toMatchObject({ kind: "update", patch: { itbis_rate: 0, price: 1779.66 } });
    const igual = planProducts([it_({})], [ex({ alegraId: "1", itbisRate: 18 })], null);
    expect((igual.actions[0] as Extract<ProductAction, { kind: "update" }>).patch).not.toHaveProperty("itbis_rate");
  });

  it("precio y costo mandan desde Alegra y se cuenta el cambio de precio", () => {
    const p = planProducts([it_({ price: [{ idPriceList: "1", name: "General", price: 2000, main: true }] })], [ex({ alegraId: "1" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", patch: { price: 2360 } });
    expect(p.priceChanged).toBe(1);
  });

  it("código de barras: rellena si falta; si es el mismo en otra forma no toca; si es distinto lo reporta y no lo pisa", () => {
    expect(planProducts([it_({})], [ex({ alegraId: "1", barcode: null })], null).actions[0]).toMatchObject({
      kind: "update",
      patch: { barcode: "390205022878" },
    });
    const mismo = planProducts([it_({})], [ex({ alegraId: "1", barcode: "0390205022878" })], null).actions[0]!;
    expect(mismo).toMatchObject({ kind: "update" });
    expect((mismo as Extract<ProductAction, { kind: "update" }>).patch).not.toHaveProperty("barcode");
    const otro = planProducts([it_({})], [ex({ alegraId: "1", barcode: "8413400011422" })], null).actions[0]! as Extract<
      ProductAction,
      { kind: "update" }
    >;
    expect(otro.patch).not.toHaveProperty("barcode");
    expect(otro.barcodeConflict).toEqual({ stored: "8413400011422", alegra: "390205022878" });
  });

  it("empareja por código de barras cuando el nombre no coincide", () => {
    const p = planProducts([it_({ name: "OTRO NOMBRE" })], [ex({ barcode: "0390205022878" })], null);
    expect(p.actions[0]).toMatchObject({ kind: "update", productId: "p1" });
  });

  it("crea los que no existen y desactiva los que Alegra ya no trae (solo los enlazados)", () => {
    const p = planProducts(
      [it_({ id: "2", name: "PRODUCTO NUEVO 30 ML", customFields: [] })],
      [ex({ alegraId: "1" }), ex({ id: "p3", name: "Manual Sin Alegra", alegraId: null, barcode: null })],
      null,
    );
    expect(p.actions.find((a) => a.kind === "create")).toMatchObject({ draft: { alegraName: "PRODUCTO NUEVO 30 ML" } });
    expect(p.actions.find((a) => a.kind === "deactivate")).toMatchObject({ productId: "p1" });
    expect(p.actions.find((a) => a.kind === "deactivate" && a.productId === "p3")).toBeUndefined();
  });

  it("no vuelve a desactivar un producto ya inactivo", () => {
    const p = planProducts([], [ex({ alegraId: "1", active: false })], null);
    expect(p.actions).toEqual([]);
  });

  it("guardia anti-vacío: con menos del 50 % de la corrida anterior no desactiva nada", () => {
    const p = planProducts([it_({ id: "2", name: "SOLO UNO" })], [ex({ alegraId: "1" })], 1487);
    expect(p.guardTripped).toBe(true);
    expect(p.actions.some((a) => a.kind === "deactivate")).toBe(false);
  });

  it("nombre ambiguo (dos productos con el mismo nombre normalizado y sin alegra_id) → no adivina: crea", () => {
    const p = planProducts([it_({ customFields: [] })], [ex({ id: "a", barcode: null }), ex({ id: "b", barcode: null })], null);
    expect(p.actions[0]!.kind).toBe("create");
  });

  it("dos ítems de Alegra con el mismo nombre no se enlazan al mismo producto", () => {
    const p = planProducts([it_({ id: "1", customFields: [] }), it_({ id: "2", customFields: [] })], [ex({ barcode: null })], null);
    expect(p.actions.map((a) => a.kind)).toEqual(["update", "create"]);
  });
});
