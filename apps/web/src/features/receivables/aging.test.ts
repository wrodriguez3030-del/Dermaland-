import { describe, it, expect } from "vitest";
import { agingBucket, computeAging, overdueDays } from "./aging";

const HOY = "2026-07-14";

describe("aging de cuentas por cobrar", () => {
  it("overdueDays: positivo vencida, negativo por vencer", () => {
    expect(overdueDays("2026-07-10", HOY)).toBe(4);
    expect(overdueDays("2026-07-20", HOY)).toBe(-6);
    expect(overdueDays(null, HOY)).toBe(0);
  });

  it("buckets según la política de colores del negocio", () => {
    expect(agingBucket("2026-08-30", HOY)).toBe("al_dia"); // falta > 7 días
    expect(agingBucket("2026-07-18", HOY)).toBe("por_vencer"); // ≤ 7 días
    expect(agingBucket("2026-07-14", HOY)).toBe("por_vencer"); // vence HOY (0 días)
    expect(agingBucket("2026-07-13", HOY)).toBe("v1_30"); // 1 día vencida
    expect(agingBucket("2026-06-14", HOY)).toBe("v1_30"); // 30 días
    expect(agingBucket("2026-06-13", HOY)).toBe("v31_60"); // 31 días
    expect(agingBucket("2026-05-15", HOY)).toBe("v31_60"); // 60 días
    expect(agingBucket("2026-05-14", HOY)).toBe("v60"); // 61 días
    expect(agingBucket(null, HOY)).toBe("al_dia"); // sin vencimiento fijado
  });

  it("computeAging acumula montos por bucket y separa vencido", () => {
    const t = computeAging(
      [
        { dueDate: "2026-08-30", balance: 100 }, // al día
        { dueDate: "2026-07-16", balance: 50.5 }, // por vencer
        { dueDate: "2026-07-01", balance: 200 }, // 1-30
        { dueDate: "2026-05-20", balance: 300 }, // 31-60
        { dueDate: "2026-01-01", balance: 400 }, // +60
      ],
      HOY,
    );
    expect(t.totalCount).toBe(5);
    expect(t.totalAmount).toBe(1050.5);
    expect(t.amount.v1_30).toBe(200);
    expect(t.overdueCount).toBe(3);
    expect(t.overdueAmount).toBe(900);
    expect(t.count.por_vencer).toBe(1);
  });
});
