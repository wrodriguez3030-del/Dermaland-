import { describe, it, expect } from "vitest";
import {
  computeIncentivesForSale,
  computeRuleForSale,
  isRuleActiveOn,
  evaluateGoalRule,
  incentivesToVoidForCancelledSale,
  type IncentiveRule,
  type SaleForIncentive,
  type ProductInfo,
} from "./incentive-engine";

const products = new Map<string, ProductInfo>([
  ["p1", { id: "p1", laboratoryId: "lab_isdin", categoryId: "cat_solar", cost: 400 }],
  ["p2", { id: "p2", laboratoryId: "lab_avene", categoryId: "cat_facial", cost: 100 }],
]);

function sale(overrides: Partial<SaleForIncentive> = {}): SaleForIncentive {
  return {
    id: "sale1",
    sellerId: "seller1",
    sellerName: "Ana",
    createdAt: "2026-07-04T10:00:00Z",
    status: "paid",
    items: [
      { productId: "p1", quantity: 2, subtotal: 2000 }, // neto 2000
      { productId: "p2", quantity: 1, subtotal: 500 }, // neto 500
    ],
    ...overrides,
  };
}

function rule(overrides: Partial<IncentiveRule>): IncentiveRule {
  return {
    id: "r1",
    name: "Regla",
    ruleType: "percent_on_sale",
    active: true,
    ...overrides,
  };
}

describe("isRuleActiveOn", () => {
  it("respeta active y el rango de fechas", () => {
    expect(isRuleActiveOn(rule({ active: false }), "2026-07-04")).toBe(false);
    expect(
      isRuleActiveOn(rule({ startsAt: "2026-07-01", endsAt: "2026-07-31" }), "2026-07-04"),
    ).toBe(true);
    expect(
      isRuleActiveOn(rule({ startsAt: "2026-08-01" }), "2026-07-04"),
    ).toBe(false);
    expect(isRuleActiveOn(rule({ endsAt: "2026-07-01" }), "2026-07-04")).toBe(false);
  });
});

describe("computeRuleForSale — tipos de regla", () => {
  it("11. monto fijo por producto: fixed × cantidad del producto", () => {
    const r = rule({ ruleType: "fixed_per_product", productId: "p1", fixedAmount: 50 });
    const out = computeRuleForSale(r, sale(), products);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ productId: "p1", incentiveAmount: 100, baseAmount: 2000 });
  });

  it("12. porcentaje sobre venta neta", () => {
    const r = rule({ ruleType: "percent_on_sale", percentage: 5 });
    const out = computeRuleForSale(r, sale(), products);
    // neto total = 2500 → 5% = 125
    expect(out[0]).toMatchObject({ incentiveAmount: 125, baseAmount: 2500 });
  });

  it("porcentaje sobre venta respeta min_sales_amount", () => {
    const r = rule({ ruleType: "percent_on_sale", percentage: 5, minSalesAmount: 3000 });
    expect(computeRuleForSale(r, sale(), products)).toHaveLength(0);
  });

  it("porcentaje sobre margen (neto − costo×cant)", () => {
    const r = rule({ ruleType: "percent_on_margin", percentage: 10 });
    // margen p1: 2000 - 400*2 = 1200; p2: 500 - 100*1 = 400; total 1600 → 10% = 160
    const out = computeRuleForSale(r, sale(), products);
    expect(out[0]).toMatchObject({ incentiveAmount: 160, baseAmount: 1600 });
  });

  it("13. incentivo por laboratorio (fijo por unidad)", () => {
    const r = rule({ ruleType: "per_laboratory", laboratoryId: "lab_isdin", fixedAmount: 30 });
    const out = computeRuleForSale(r, sale(), products);
    // solo p1 (2 unid) → 60, base neto 2000
    expect(out[0]).toMatchObject({ incentiveAmount: 60, baseAmount: 2000 });
  });

  it("incentivo por laboratorio (porcentaje)", () => {
    const r = rule({ ruleType: "per_laboratory", laboratoryId: "lab_avene", percentage: 8 });
    const out = computeRuleForSale(r, sale(), products);
    // solo p2 neto 500 → 8% = 40
    expect(out[0]).toMatchObject({ incentiveAmount: 40, baseAmount: 500 });
  });

  it("14. incentivo por categoría", () => {
    const r = rule({ ruleType: "per_category", categoryId: "cat_solar", percentage: 10 });
    const out = computeRuleForSale(r, sale(), products);
    // p1 categoria solar, neto 2000 → 10% = 200
    expect(out[0]).toMatchObject({ incentiveAmount: 200, baseAmount: 2000 });
  });

  it("regla sin líneas coincidentes → sin incentivo", () => {
    const r = rule({ ruleType: "per_laboratory", laboratoryId: "lab_inexistente", fixedAmount: 30 });
    expect(computeRuleForSale(r, sale(), products)).toHaveLength(0);
  });

  it("per_goal no se resuelve por venta individual", () => {
    const r = rule({ ruleType: "per_goal", minSalesAmount: 1000, fixedAmount: 500 });
    expect(computeRuleForSale(r, sale(), products)).toHaveLength(0);
  });
});

describe("computeIncentivesForSale", () => {
  it("15. genera incentivos de una venta pagada con vendedor", () => {
    const rules = [
      rule({ id: "a", ruleType: "percent_on_sale", percentage: 5 }),
      rule({ id: "b", ruleType: "fixed_per_product", productId: "p1", fixedAmount: 50 }),
    ];
    const out = computeIncentivesForSale(sale(), rules, products);
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.ruleId).sort()).toEqual(["a", "b"]);
    expect(out.every((i) => i.sellerId === "seller1")).toBe(true);
  });

  it("venta SIN vendedor no genera incentivos", () => {
    const rules = [rule({ ruleType: "percent_on_sale", percentage: 5 })];
    expect(computeIncentivesForSale(sale({ sellerId: null }), rules, products)).toHaveLength(0);
  });

  it("venta anulada/borrador no genera incentivos", () => {
    const rules = [rule({ ruleType: "percent_on_sale", percentage: 5 })];
    expect(computeIncentivesForSale(sale({ status: "cancelled" }), rules, products)).toHaveLength(0);
    expect(computeIncentivesForSale(sale({ status: "draft" }), rules, products)).toHaveLength(0);
  });

  it("16. una regla creada DESPUÉS (fuera de vigencia) no aplica a venta previa", () => {
    const rules = [
      rule({ ruleType: "percent_on_sale", percentage: 5, startsAt: "2026-08-01" }),
    ];
    // venta 2026-07-04 < inicio de la regla → sin incentivo
    expect(computeIncentivesForSale(sale(), rules, products)).toHaveLength(0);
  });
});

describe("evaluateGoalRule", () => {
  it("meta alcanzada → incentivo fijo", () => {
    const r = rule({ ruleType: "per_goal", minSalesAmount: 10000, fixedAmount: 1500 });
    expect(evaluateGoalRule(r, 12000)).toBe(1500);
    expect(evaluateGoalRule(r, 8000)).toBe(0);
  });
  it("meta con porcentaje sobre el total del período", () => {
    const r = rule({ ruleType: "per_goal", minSalesAmount: 10000, percentage: 2 });
    expect(evaluateGoalRule(r, 15000)).toBe(300);
  });
});

describe("incentivesToVoidForCancelledSale — devoluciones", () => {
  it("17. venta anulada revierte incentivos pendientes/aprobados (no pagados)", () => {
    const existing = [
      { id: "i1", status: "pending" },
      { id: "i2", status: "approved" },
      { id: "i3", status: "paid" },
    ];
    const toVoid = incentivesToVoidForCancelledSale("cancelled", existing);
    expect(toVoid.sort()).toEqual(["i1", "i2"]); // i3 pagado NO se toca aquí
  });

  it("venta que sigue pagada no revierte nada", () => {
    const existing = [{ id: "i1", status: "pending" }];
    expect(incentivesToVoidForCancelledSale("paid", existing)).toHaveLength(0);
  });
});
