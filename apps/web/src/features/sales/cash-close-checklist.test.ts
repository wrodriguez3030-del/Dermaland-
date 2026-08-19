import { describe, expect, it } from "vitest";
import { closeChecklist } from "./cash-close-checklist";

const venta = (status: string, total: number, balance: number) => ({
  status,
  total,
  balance,
});

describe("closeChecklist", () => {
  it("turno limpio: todo cobrado", () => {
    expect(
      closeChecklist([venta("paid", 100, 0), venta("converted_to_ecf", 50, 0)]),
    ).toEqual({
      settled: 2,
      drafts: 0,
      draftsTotal: 0,
      credit: 0,
      creditTotal: 0,
      allSettled: true,
    });
  });

  it("los borradores se avisan con su total", () => {
    const r = closeChecklist([venta("draft", 300, 300), venta("paid", 100, 0)]);
    expect(r.drafts).toBe(1);
    expect(r.draftsTotal).toBe(300);
    expect(r.allSettled).toBe(false);
  });

  it("lo emitido con balance es crédito (CxC), no un error", () => {
    const r = closeChecklist([
      venta("issued", 500, 500),
      venta("partially_paid", 200, 80),
      venta("paid", 100, 0),
    ]);
    expect(r.credit).toBe(2);
    expect(r.creditTotal).toBe(580);
    expect(r.settled).toBe(1);
    expect(r.allSettled).toBe(false);
  });

  it("anuladas y vencidas no cuentan", () => {
    const r = closeChecklist([
      venta("cancelled", 100, 100),
      venta("expired", 50, 50),
    ]);
    expect(r).toEqual({
      settled: 0,
      drafts: 0,
      draftsTotal: 0,
      credit: 0,
      creditTotal: 0,
      allSettled: true,
    });
  });
});
