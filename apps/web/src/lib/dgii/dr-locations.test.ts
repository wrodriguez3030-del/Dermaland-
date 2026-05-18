import { describe, it, expect } from "vitest";
import {
  ALL_LOCATIONS,
  PROVINCIAS,
  MUNICIPIOS,
  DISTRITOS,
  findLocationByCode,
  findLocationByFuzzyName,
  getChildrenOfProvince,
  getMunicipiosOfProvince,
} from "./dr-locations";

describe("dr-locations — catálogo extraído del XSD DGII", () => {
  it("contiene 582 entradas totales (XSD oficial)", () => {
    expect(ALL_LOCATIONS.length).toBe(582);
  });

  it("contiene 32 provincias", () => {
    expect(PROVINCIAS.length).toBe(32);
  });

  it("todas las provincias tienen código que termina en 0000", () => {
    for (const p of PROVINCIAS) {
      expect(p.code.endsWith("0000")).toBe(true);
      expect(p.code).toBe(p.provinceCode);
    }
  });

  it("todos los códigos son únicos", () => {
    const codes = new Set(ALL_LOCATIONS.map((l) => l.code));
    expect(codes.size).toBe(ALL_LOCATIONS.length);
  });

  it("todos los códigos son strings de 6 dígitos", () => {
    for (const l of ALL_LOCATIONS) {
      expect(l.code).toMatch(/^\d{6}$/);
    }
  });

  it("todos los municipios y distritos referencian una provincia existente", () => {
    const provinceCodes = new Set(PROVINCIAS.map((p) => p.code));
    for (const l of [...MUNICIPIOS, ...DISTRITOS]) {
      expect(provinceCodes.has(l.provinceCode)).toBe(true);
    }
  });
});

describe("dr-locations — lookups", () => {
  it("findLocationByCode retorna la provincia Distrito Nacional", () => {
    const dn = findLocationByCode("010000");
    expect(dn?.type).toBe("provincia");
    expect(dn?.name).toContain("DISTRITO NACIONAL");
  });

  it("findLocationByCode retorna undefined si no existe", () => {
    expect(findLocationByCode("999999")).toBeUndefined();
  });

  it("getChildrenOfProvince retorna municipios + distritos de la provincia", () => {
    const children = getChildrenOfProvince("010000");
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) {
      expect(c.provinceCode).toBe("010000");
      expect(c.code).not.toBe("010000");
    }
  });

  it("getMunicipiosOfProvince retorna solo los municipios", () => {
    const munis = getMunicipiosOfProvince("020000");
    for (const m of munis) {
      expect(m.type).toBe("municipio");
      expect(m.provinceCode).toBe("020000");
    }
    expect(munis.length).toBeGreaterThan(0);
  });

  it("findLocationByFuzzyName encuentra 'AZUA' exacto", () => {
    const m = findLocationByFuzzyName("AZUA");
    expect(m).toBeDefined();
  });

  it("findLocationByFuzzyName case-insensitive", () => {
    const m = findLocationByFuzzyName("santo domingo");
    expect(m).toBeDefined();
    expect(m?.name.toLowerCase()).toContain("santo domingo");
  });

  it("findLocationByFuzzyName retorna undefined para basura", () => {
    expect(findLocationByFuzzyName("XYZWXYZ12345")).toBeUndefined();
  });
});
