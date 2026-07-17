import { describe, expect, it } from "vitest";
import { receptionShelfLifeCheck } from "./reception-shelf-life";

const REF = new Date("2026-07-17T00:00:00Z");
const inDays = (n: number) => new Date(REF.getTime() + n * 86_400_000).toISOString();

describe("receptionShelfLifeCheck", () => {
  it("marca bajo mínimo cuando la vida útil restante es menor al mínimo del lab", () => {
    const r = receptionShelfLifeCheck({ expiresAt: inDays(45), minShelfLifeDays: 90, ref: REF });
    expect(r.belowMinimum).toBe(true);
    expect(r.remainingDays).toBe(45);
    expect(r.minDays).toBe(90);
  });

  it("NO marca bajo mínimo si cumple justo el umbral (restante == mínimo)", () => {
    const r = receptionShelfLifeCheck({ expiresAt: inDays(90), minShelfLifeDays: 90, ref: REF });
    expect(r.belowMinimum).toBe(false);
    expect(r.remainingDays).toBe(90);
  });

  it("sin regla (min null/undefined) nunca marca bajo mínimo", () => {
    expect(receptionShelfLifeCheck({ expiresAt: inDays(5), minShelfLifeDays: null, ref: REF }).belowMinimum).toBe(false);
    expect(receptionShelfLifeCheck({ expiresAt: inDays(5), minShelfLifeDays: undefined, ref: REF }).belowMinimum).toBe(false);
  });

  it("un lote ya vencido cuenta como bajo mínimo (restante negativo < umbral)", () => {
    const r = receptionShelfLifeCheck({ expiresAt: inDays(-3), minShelfLifeDays: 60, ref: REF });
    expect(r.belowMinimum).toBe(true);
    expect(r.remainingDays).toBe(-3);
  });

  it("expiresAt vacío no se puede evaluar → no marca bajo mínimo, remainingDays null", () => {
    const r = receptionShelfLifeCheck({ expiresAt: "", minShelfLifeDays: 90, ref: REF });
    expect(r.belowMinimum).toBe(false);
    expect(r.remainingDays).toBeNull();
  });
});
