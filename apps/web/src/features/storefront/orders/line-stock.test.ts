import { describe, expect, it } from "vitest";
import type { WebAvailability } from "../stock";
import { lineStockVerdict, orderCanBeFulfilled } from "./line-stock";

const NOMBRES = new Map([
  ["cutis", "Cutis"],
  ["santiago", "Santiago"],
]);

function disp(p: {
  physical?: number;
  committed?: number;
  available?: number;
  byBranch?: [string, number][];
}): WebAvailability {
  const byBranch = new Map(p.byBranch ?? []);
  const physical = p.physical ?? [...byBranch.values()].reduce((a, b) => a + b, 0);
  const committed = p.committed ?? 0;
  return {
    physical,
    committed,
    available: p.available ?? Math.max(0, physical - committed),
    byBranch,
  };
}

describe("lineStockVerdict", () => {
  it("está en la sucursal que despacha: nada que hacer", () => {
    const v = lineStockVerdict(2, disp({ byBranch: [["cutis", 5]] }), "cutis", NOMBRES);
    expect(v.tone).toBe("ok");
    expect(v.label).toBe("Hay 5 aquí");
  });

  it("justo lo último también es ok", () => {
    const v = lineStockVerdict(3, disp({ byBranch: [["cutis", 3]] }), "cutis", NOMBRES);
    expect(v.tone).toBe("ok");
  });

  it("no hay en ninguna parte: hay que llamar al cliente", () => {
    const v = lineStockVerdict(1, disp({ byBranch: [] }), "cutis", NOMBRES);
    expect(v.tone).toBe("bad");
    expect(v.label).toBe("Sin existencia");
  });

  it("un producto que no se pudo leer cuenta como sin existencia", () => {
    const v = lineStockVerdict(1, undefined, "cutis", NOMBRES);
    expect(v.tone).toBe("bad");
  });

  it("está en OTRA sucursal: dice en cuál, que es lo que se necesita saber", () => {
    const v = lineStockVerdict(
      2,
      disp({ byBranch: [["santiago", 4]] }),
      "cutis",
      NOMBRES,
    );
    expect(v.tone).toBe("warn");
    expect(v.label).toBe("No está en esta sucursal");
    expect(v.hint).toBe("Hay en: Santiago (4).");
  });

  it("hay algo aquí pero no alcanza", () => {
    const v = lineStockVerdict(
      5,
      disp({ byBranch: [["cutis", 2], ["santiago", 6]] }),
      "cutis",
      NOMBRES,
    );
    expect(v.tone).toBe("warn");
    expect(v.label).toBe("Solo 2 de 5 aquí");
    expect(v.hint).toContain("Santiago (6)");
  });

  it("hay de sobra en el estante pero está apalabrado a otros pedidos", () => {
    // Esta es la que no se ve mirando el inventario: el número del almacén
    // dice 10 y la tienda ya prometió 9 a otra gente.
    const v = lineStockVerdict(
      3,
      disp({ byBranch: [["cutis", 10]], committed: 9 }),
      "cutis",
      NOMBRES,
    );
    expect(v.tone).toBe("warn");
    expect(v.label).toBe("Quedan 1 libres de 10");
    expect(v.hint).toContain("9 unidades están apalabradas");
  });

  it("concuerda el singular al hablar de lo apalabrado", () => {
    const v = lineStockVerdict(
      10,
      disp({ byBranch: [["cutis", 10]], committed: 1 }),
      "cutis",
      NOMBRES,
    );
    expect(v.hint).toContain("1 unidad está apalabrada");
  });

  it("no inventa nombres de sucursal que no conoce", () => {
    const v = lineStockVerdict(
      1,
      disp({ byBranch: [["desconocida", 3]] }),
      "cutis",
      NOMBRES,
    );
    expect(v.hint).toBe("Hay en: otra sucursal (3).");
  });
});

describe("orderCanBeFulfilled", () => {
  it("solo si TODAS las líneas están en la sucursal", () => {
    expect(orderCanBeFulfilled([{ tone: "ok", label: "" }, { tone: "ok", label: "" }])).toBe(true);
    expect(orderCanBeFulfilled([{ tone: "ok", label: "" }, { tone: "warn", label: "" }])).toBe(false);
    expect(orderCanBeFulfilled([{ tone: "bad", label: "" }])).toBe(false);
  });

  it("un pedido sin líneas no se puede despachar", () => {
    expect(orderCanBeFulfilled([])).toBe(false);
  });
});
