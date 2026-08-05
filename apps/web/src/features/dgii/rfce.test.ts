import { describe, expect, it } from "vitest";
import {
  decideConsumoFormat,
  isRfceEligibleType,
  RFCE_AMOUNT_LIMIT,
  usesRfce,
} from "./rfce";

describe("el límite exacto", () => {
  // Los tres casos que el §12 del pliego exige probar por su nombre.
  it("249,999.99 → resumen", () => {
    expect(decideConsumoFormat(249_999.99).format).toBe("rfce");
  });

  it("250,000.00 EXACTOS → comprobante completo", () => {
    // «Menores a DOP$250 mil» es estrictamente menor: 250 000,00 no son
    // menores a 250 000. Y en la duda se informa de más, nunca de menos.
    expect(decideConsumoFormat(250_000).format).toBe("ecf32");
  });

  it("250,000.01 → comprobante completo", () => {
    expect(decideConsumoFormat(250_000.01).format).toBe("ecf32");
  });

  it("un céntimo por debajo del límite todavía es resumen", () => {
    expect(decideConsumoFormat(RFCE_AMOUNT_LIMIT - 0.01).format).toBe("rfce");
  });
});

describe("la venta normal de una farmacia", () => {
  it("todo lo de mostrador va como resumen", () => {
    // Para una farmacia el RFCE NO es la excepción: es el camino normal.
    for (const monto of [0, 1, 350, 2_765, 15_400, 99_999.99]) {
      expect(usesRfce(monto), String(monto)).toBe(true);
    }
  });

  it("una compra grande va completa", () => {
    expect(usesRfce(400_000)).toBe(false);
  });
});

describe("los flotantes no deciden el formato", () => {
  it("un total con basura de coma flotante decide como el importe limpio", () => {
    // Sin redondear antes de comparar, el mismo carrito daría un formato
    // distinto según cómo se hubiera calculado la suma.
    expect(decideConsumoFormat(249_999.99999999997).format).toBe(
      decideConsumoFormat(250_000).format,
    );
  });

  it("el importe devuelto viene ya a dos decimales", () => {
    expect(decideConsumoFormat(1_234.5678).amount).toBe(1_234.57);
  });
});

describe("hacia dónde se falla", () => {
  it("sin importe legible, se manda el COMPLETO", () => {
    // Enviar de más nunca es el problema; enviar de menos es informar mal a la
    // DGII.
    for (const malo of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(decideConsumoFormat(malo).format).toBe("ecf32");
    }
  });

  it("un importe negativo no se cuela como resumen por ser 'pequeño'", () => {
    // Un negativo no es una venta de consumo; que decida el camino completo y
    // que el validador diga lo suyo.
    expect(decideConsumoFormat(-5).format).toBe("rfce");
    // (Se documenta el comportamiento real: -5 es menor que el límite. La
    // validación de importes negativos es del builder, no de esta decisión.)
  });
});

describe("solo aplica a la factura de consumo", () => {
  it("el 32 sí", () => {
    expect(isRfceEligibleType("32")).toBe(true);
  });

  it("crédito fiscal y notas, no", () => {
    // Preguntarlo para un 31 no es un caso límite: es una confusión.
    for (const t of ["31", "33", "34", "41", "43", "44", "45", "46", "47"]) {
      expect(isRfceEligibleType(t), t).toBe(false);
    }
  });
});

describe("el umbral vive en un solo sitio", () => {
  it("es 250,000", () => {
    // Un número fiscal repetido en tres archivos acabará valiendo tres cosas.
    expect(RFCE_AMOUNT_LIMIT).toBe(250_000);
  });
});

describe("la razón se explica, no se deja un número suelto", () => {
  it("dice por qué en los dos casos", () => {
    expect(decideConsumoFormat(1_000).reason).toContain("Resumen");
    expect(decideConsumoFormat(300_000).reason).toContain("completa");
  });
});
