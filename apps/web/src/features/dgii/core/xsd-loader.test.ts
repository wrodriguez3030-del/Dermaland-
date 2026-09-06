// Portada de agendapp: tests/unit/dgii-xsd-loader.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  resolveXsdPath,
  isKnownXsdTipo,
  loadXsdForTipo,
  hasOfficialXsd,
  XSD_DIR,
} from "./xsd-loader";
import { EcfValidatorError } from "./validator-types";

describe("xsd-loader — allowlist de tipos", () => {
  it("isKnownXsdTipo acepta los 10 tipos con XSD oficial (v349); 42/99 rechazados", () => {
    // v349 — 41-47 tienen XSD oficial descargado (capa de VALIDACIÓN; la emisión
    // sigue gateada por ECF_TIPOS_BUILDER — ver dgii-ecf-capabilities-v349).
    for (const t of ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]) expect(isKnownXsdTipo(t)).toBe(true);
    for (const t of ["42", "99", "", "abc"]) expect(isKnownXsdTipo(t)).toBe(false);
  });

  it("resolveXsdPath devuelve una ruta dentro de XSD_DIR para tipos conocidos", () => {
    const p = resolveXsdPath("32");
    expect(p.startsWith(XSD_DIR)).toBe(true);
    expect(p.endsWith("e-CF-32-v1.0.xsd")).toBe(true);
  });

  it("resolveXsdPath rechaza tipos desconocidos / path traversal", () => {
    expect(() => resolveXsdPath("../../etc/passwd")).toThrow(EcfValidatorError);
    expect(() => resolveXsdPath("../secret")).toThrow(EcfValidatorError);
    expect(() => resolveXsdPath("42")).toThrow(EcfValidatorError); // v349: 41 ya es válido; 42 sigue fuera
    expect(() => resolveXsdPath("")).toThrow(EcfValidatorError);
  });

  it("loadXsdForTipo carga el XSD oficial (ya presente) para los 4 tipos", async () => {
    for (const t of ["31", "32", "33", "34"]) {
      const xsd = await loadXsdForTipo(t);
      expect(xsd).toContain("xs:schema");
      expect(xsd.length).toBeGreaterThan(1000);
    }
  });

  it("loadXsdForTipo lanza EcfValidatorError para tipo no permitido", async () => {
    await expect(loadXsdForTipo("99")).rejects.toBeInstanceOf(EcfValidatorError);
  });

  it("hasOfficialXsd=true para tipos con XSD; false para tipo inválido", async () => {
    expect(await hasOfficialXsd("31")).toBe(true);
    expect(await hasOfficialXsd("99")).toBe(false);
  });
});
