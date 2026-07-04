import { describe, it, expect } from "vitest";
import {
  validateNumberingWrite,
  type NumberingLike,
} from "./numbering-rules";

const base: NumberingLike = {
  id: "n1",
  documentType: "consumo",
  prefix: "B02",
  environment: "mock",
  isPreferred: true,
  status: "active",
  rangeStart: 1,
  rangeEnd: 50000,
  nextNumber: 1300,
};

const validCreate = {
  name: "Consumo demo",
  documentType: "consumo",
  prefix: "B02X",
  rangeStart: 1,
  rangeEnd: 100,
  nextNumber: 1,
  environment: "demo",
  isPreferred: false,
  status: "active",
};

describe("validateNumberingWrite", () => {
  it("acepta un create válido", () => {
    expect(validateNumberingWrite(validCreate, [base])).toBeNull();
  });

  it("rechaza siguiente número fuera de rango", () => {
    expect(
      validateNumberingWrite({ ...validCreate, nextNumber: 500 }, [base]),
    ).toMatch(/dentro del rango/);
  });

  it("rechaza ambiente produccion mientras DGII real está apagado", () => {
    expect(
      validateNumberingWrite({ ...validCreate, environment: "produccion" }, []),
    ).toMatch(/Producción.*apagada/);
  });

  it("rechaza dos preferidas activas para el mismo tipo + ambiente", () => {
    expect(
      validateNumberingWrite(
        { ...validCreate, environment: "mock", isPreferred: true },
        [base],
      ),
    ).toMatch(/preferida activa/);
  });

  it("rechaza prefijo duplicado para mismo tipo + ambiente", () => {
    expect(
      validateNumberingWrite(
        { ...validCreate, prefix: "b02", environment: "mock" },
        [base],
      ),
    ).toMatch(/mismo prefijo/);
  });

  it("edición: no permite bajar el siguiente número (reutilizaría emitidos)", () => {
    expect(
      validateNumberingWrite({ nextNumber: 1200 }, [base], base),
    ).toMatch(/bajar el siguiente número/);
  });

  it("edición: no permite mover el inicio del rango si ya emitió", () => {
    expect(
      validateNumberingWrite({ rangeStart: 100, nextNumber: 1300 }, [base], base),
    ).toMatch(/inicio del rango/);
  });

  it("edición: no permite fin de rango por debajo del último emitido", () => {
    expect(
      validateNumberingWrite({ rangeEnd: 1200, nextNumber: 1300 }, [base], base),
    ).toMatch(/fin del rango/);
  });

  it("edición: SÍ permite ampliar el rango final (caso agotamiento)", () => {
    expect(
      validateNumberingWrite({ rangeEnd: 90000 }, [base], base),
    ).toBeNull();
  });

  it("create: requiere nombre y prefijo", () => {
    expect(validateNumberingWrite({ ...validCreate, name: " " }, [])).toMatch(
      /nombre/,
    );
    expect(
      validateNumberingWrite({ ...validCreate, prefix: "" }, []),
    ).toMatch(/prefijo/);
  });
});
