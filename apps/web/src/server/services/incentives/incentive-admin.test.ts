import { describe, expect, it } from "vitest";
import { paymentGroupsForSale, ruleRowToClient, ruleRowToEngine } from "./incentive-admin";

/**
 * 🔴🔴 Bug real hasta el 10/09/2026: `ruleRowToEngine` no traía
 * `payment_groups`, así que el motor (`incentive-engine.ts`) no tenía forma
 * de saber que "Efectivo y transferencia 3%" y "Tarjeta/crédito 1%" son
 * reglas EXCLUYENTES por método de pago — las dos aplicaban a cualquier
 * venta. Nunca llegó a pagar de más porque no había ventas reales con
 * vendedor (0 incentivos "en vivo" en la base), pero la primera venta real
 * lo habría hecho.
 */
describe("ruleRowToEngine / ruleRowToClient traen payment_groups", () => {
  const fila = {
    id: "r1",
    name: "Efectivo y transferencia 3%",
    rule_type: "percent_on_sale",
    product_id: null,
    laboratory_id: null,
    category_id: null,
    percentage: 3,
    fixed_amount: null,
    min_sales_amount: null,
    starts_at: null,
    ends_at: null,
    active: true,
    note: null,
    payment_groups: ["cash", "transfer"],
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  it("ruleRowToEngine mapea payment_groups → paymentGroups", () => {
    expect(ruleRowToEngine(fila).paymentGroups).toEqual(["cash", "transfer"]);
  });

  it("ruleRowToClient también lo expone (para mostrarlo/editarlo en el admin)", () => {
    expect(ruleRowToClient(fila).paymentGroups).toEqual(["cash", "transfer"]);
  });

  it("sin payment_groups en la fila, mapea a null (aplica a cualquier método)", () => {
    const sinGrupos = { ...fila, payment_groups: null };
    expect(ruleRowToEngine(sinGrupos).paymentGroups).toBeNull();
    expect(ruleRowToClient(sinGrupos).paymentGroups).toBeNull();
  });
});

function fakeSupabaseConPagos(pagos: { method_code: string; amount: number }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: pagos, error: null }),
      }),
    }),
  };
}

describe("paymentGroupsForSale", () => {
  it("una venta en efectivo devuelve solo [\"cash\"]", async () => {
    const sb = fakeSupabaseConPagos([{ method_code: "cash", amount: 1000 }]);
    expect(await paymentGroupsForSale(sb, "s1")).toEqual(["cash"]);
  });

  it("una venta con tarjeta devuelve solo [\"card\"] — azul/cardnet/visanet agrupan a card", async () => {
    const sb = fakeSupabaseConPagos([{ method_code: "azul", amount: 500 }]);
    expect(await paymentGroupsForSale(sb, "s1")).toEqual(["card"]);
  });

  it("una venta pagada con efectivo Y tarjeta devuelve los DOS grupos", async () => {
    const sb = fakeSupabaseConPagos([
      { method_code: "cash", amount: 500 },
      { method_code: "card", amount: 500 },
    ]);
    const grupos = await paymentGroupsForSale(sb, "s1");
    expect(new Set(grupos)).toEqual(new Set(["cash", "card"]));
  });

  it("un pago con monto 0 (o negativo) no cuenta como método real", async () => {
    const sb = fakeSupabaseConPagos([{ method_code: "card", amount: 0 }]);
    expect(await paymentGroupsForSale(sb, "s1")).toEqual([]);
  });

  it("sin pagos registrados, devuelve []", async () => {
    const sb = fakeSupabaseConPagos([]);
    expect(await paymentGroupsForSale(sb, "s1")).toEqual([]);
  });
});
