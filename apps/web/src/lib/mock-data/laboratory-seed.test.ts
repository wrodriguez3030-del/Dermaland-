import { describe, it, expect } from "vitest";
import {
  LABORATORY_SEED,
  normalizeLabName,
  laboratoryTypeByName,
} from "./laboratory-seed";
import { mockLaboratories } from "./catalog";

describe("Semilla de laboratorios", () => {
  it("3. carga al menos 50 laboratorios en la semilla", () => {
    expect(LABORATORY_SEED.length).toBeGreaterThanOrEqual(50);
  });

  it("3b. el catálogo mock expone al menos 50 laboratorios", () => {
    expect(mockLaboratories.length).toBeGreaterThanOrEqual(50);
  });

  it("4. incluye laboratorios dominicanos", () => {
    const names = LABORATORY_SEED.map((l) => l.name);
    expect(names).toContain("Laboratorios Dr. Collado");
    expect(names).toContain("Laboratorios Rowe");
    expect(names).toContain("Laboratorios Magnachem");
    const rd = LABORATORY_SEED.filter((l) => l.country === "República Dominicana");
    expect(rd.length).toBeGreaterThanOrEqual(15);
  });

  it("incluye marcas dermocosméticas internacionales", () => {
    const names = LABORATORY_SEED.map((l) => l.name);
    for (const n of ["ISDIN", "La Roche-Posay", "Vichy", "Eucerin", "Avène", "CeraVe"]) {
      expect(names).toContain(n);
    }
  });

  it("6. no duplica laboratorios por nombre normalizado (semilla)", () => {
    const norm = LABORATORY_SEED.map((l) => normalizeLabName(l.name));
    expect(new Set(norm).size).toBe(norm.length);
  });

  it("6b. el catálogo mock no tiene laboratorios duplicados por nombre", () => {
    const norm = mockLaboratories.map((l) => normalizeLabName(l.name));
    expect(new Set(norm).size).toBe(norm.length);
  });

  it("normaliza ignorando mayúsculas y acentos (ISDIN/isdin, Avène/avene)", () => {
    expect(normalizeLabName("ISDIN")).toBe(normalizeLabName("isdin"));
    expect(normalizeLabName("Avène")).toBe(normalizeLabName("avene"));
  });

  it("resuelve el tipo conocido por nombre para el subtítulo", () => {
    expect(laboratoryTypeByName("ISDIN")).toBe("Dermocosmética");
    expect(laboratoryTypeByName("isdin")).toBe("Dermocosmética"); // case-insensitive
    expect(laboratoryTypeByName("Marca Inexistente")).toBeUndefined();
  });
});
