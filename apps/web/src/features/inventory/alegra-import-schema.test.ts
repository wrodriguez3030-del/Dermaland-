import { describe, it, expect } from "vitest";
import { alegraImportBodySchema } from "./alegra-import-schema";

describe("alegraImportBodySchema", () => {
  it("acepta un body válido", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 1, qtyTotal: 2 }],
      zeroMissing: true,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza más de 5000 filas (tope anti-DoS)", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      rowNumber: i + 2, name: "X", qtyPrincipal: 0, qtyTotal: 0,
    }));
    expect(alegraImportBodySchema.safeParse({ rows }).success).toBe(false);
  });

  it("rechaza un nombre desmesurado", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X".repeat(301), qtyPrincipal: 0, qtyTotal: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza cantidades que no son enteros", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 1.5, qtyTotal: 2 }],
    });
    expect(r.success).toBe(false);
  });

  it("zeroMissing por defecto es false", () => {
    const r = alegraImportBodySchema.parse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 0, qtyTotal: 0 }],
    });
    expect(r.zeroMissing).toBe(false);
  });
});
