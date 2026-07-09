import { describe, it, expect } from "vitest";
import {
  validateRule,
  upsertRule,
  removeRule,
  toggleRuleIn,
  type RuleFormInput,
} from "./commission-rules-store";
import { DEFAULT_COMMISSION_RULES } from "./commission-rules";
import { resolveCommissionRule } from "./commission-engine";

const valid: RuleFormInput = {
  name: "PayPal 2%",
  percentage: 2,
  paymentGroups: ["other"],
  priority: 5,
  active: true,
};

describe("validateRule", () => {
  it("acepta una regla válida", () => {
    expect(validateRule(valid)).toBeNull();
  });
  it("rechaza nombre vacío", () => {
    expect(validateRule({ ...valid, name: "  " })).toMatch(/nombre/i);
  });
  it("rechaza porcentaje fuera de 0..100 o NaN", () => {
    expect(validateRule({ ...valid, percentage: -1 })).toMatch(/porcentaje/i);
    expect(validateRule({ ...valid, percentage: 101 })).toMatch(/porcentaje/i);
    expect(validateRule({ ...valid, percentage: Number.NaN })).toMatch(/porcentaje/i);
  });
  it("rechaza rango de fechas invertido", () => {
    expect(
      validateRule({ ...valid, startsAt: "2026-06-30", endsAt: "2026-06-01" }),
    ).toMatch(/Desde/i);
  });
});

describe("upsertRule — agregar", () => {
  it("agrega una regla nueva con su id", () => {
    const res = upsertRule([], "create", valid, "rule_new");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rules).toHaveLength(1);
      expect(res.rules[0]!.id).toBe("rule_new");
      expect(res.rules[0]!.percentage).toBe(2);
      expect(res.rules[0]!.paymentGroups).toEqual(["other"]);
    }
  });
  it("paymentGroups vacío se normaliza a undefined (aplica a cualquier método)", () => {
    const res = upsertRule([], "create", { ...valid, paymentGroups: [] }, "r1");
    expect(res.ok && res.rules[0]!.paymentGroups).toBeUndefined();
  });
  it("propaga el error de validación", () => {
    const res = upsertRule([], "create", { ...valid, percentage: 200 }, "r1");
    expect(res.ok).toBe(false);
  });
});

describe("upsertRule — editar", () => {
  const rules = DEFAULT_COMMISSION_RULES;
  it("edita una regla existente por id", () => {
    const res = upsertRule(rules, "edit", { ...valid, name: "Efectivo 4%", percentage: 4, paymentGroups: ["cash"] }, "rule_cash_transfer_3");
    expect(res.ok).toBe(true);
    if (res.ok) {
      const edited = res.rules.find((r) => r.id === "rule_cash_transfer_3")!;
      expect(edited.percentage).toBe(4);
      expect(edited.name).toBe("Efectivo 4%");
    }
  });
  it("falla si el id no existe", () => {
    const res = upsertRule(rules, "edit", valid, "no_existe");
    expect(res.ok).toBe(false);
  });
});

describe("removeRule / toggleRuleIn", () => {
  it("elimina por id", () => {
    const out = removeRule(DEFAULT_COMMISSION_RULES, "rule_card_1");
    expect(out.find((r) => r.id === "rule_card_1")).toBeUndefined();
    expect(out).toHaveLength(DEFAULT_COMMISSION_RULES.length - 1);
  });
  it("activa/desactiva por id", () => {
    const out = toggleRuleIn(DEFAULT_COMMISSION_RULES, "rule_card_1");
    expect(out.find((r) => r.id === "rule_card_1")!.active).toBe(false);
  });
});

describe("las reglas editadas afectan el cálculo (integración con el motor)", () => {
  it("editar la regla de tarjeta a 2% cambia la tasa resuelta", () => {
    const edited = upsertRule(
      DEFAULT_COMMISSION_RULES,
      "edit",
      { name: "Tarjeta 2%", percentage: 2, paymentGroups: ["card"], priority: 10, active: true },
      "rule_card_1",
    );
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      const rule = resolveCommissionRule("card", { date: "2026-06-01" }, edited.rules);
      expect(rule?.percentage).toBe(2);
    }
  });
  it("desactivar una regla la excluye de la resolución", () => {
    const off = toggleRuleIn(DEFAULT_COMMISSION_RULES, "rule_card_1");
    expect(resolveCommissionRule("card", { date: "2026-06-01" }, off)).toBeNull();
  });
  it("una regla nueva con mayor prioridad gana", () => {
    const withNew = upsertRule(
      DEFAULT_COMMISSION_RULES,
      "create",
      { name: "Efectivo VIP 5%", percentage: 5, paymentGroups: ["cash"], priority: 99, active: true },
      "rule_vip",
    );
    expect(withNew.ok).toBe(true);
    if (withNew.ok) {
      const rule = resolveCommissionRule("cash", { date: "2026-06-01" }, withNew.rules);
      expect(rule?.percentage).toBe(5);
    }
  });
});
