import { describe, expect, it } from "vitest";
import { patchOfficialDgiiXsd, validateEcfXml } from "./validator";
import {
  AUX_SCHEMAS,
  ECF_TYPES,
  loadSchema,
  loadSchemaForEcfType,
  SCHEMA_CHECKSUMS,
  SchemaNotFound,
  verifySchemaIntegrity,
} from "./xsd-registry";

/**
 * Los esquemas oficiales, fijados.
 *
 * Antes había cuatro XSD para diez tipos: **seis tipos se habrían firmado y
 * enviado sin validar contra nada**. Esta prueba impide volver ahí, y además
 * fija los bytes: si alguien sustituye un esquema, se entera aquí y no cuando
 * la DGII rechaza un comprobante.
 */

describe("los diez tipos tienen esquema", () => {
  it("ninguno se queda sin", async () => {
    for (const tipo of ECF_TYPES) {
      const xsd = await loadSchemaForEcfType(tipo);
      expect(xsd.length, tipo).toBeGreaterThan(1000);
      expect(xsd, tipo).toContain("xs:schema");
    }
  });

  it("los auxiliares también: acuse, anulación y aprobación comercial", async () => {
    for (const aux of AUX_SCHEMAS) {
      const xsd = await loadSchema(aux);
      expect(xsd, aux).toContain("xs:schema");
    }
  });

  it("cada esquema declara la raíz que le toca", async () => {
    // Validar un e-CF contra el esquema equivocado daría un «válido» que no
    // significa nada. La raíz es la comprobación más barata de que el archivo
    // es el que se cree.
    for (const tipo of ECF_TYPES) {
      const xsd = await loadSchemaForEcfType(tipo);
      expect(xsd, tipo).toMatch(/<xs:element name="ECF"/);
    }
    expect(await loadSchema("RFCE")).toMatch(/<xs:element name="RFCE"/);
    expect(await loadSchema("ARECF")).toMatch(/<xs:element name="ARECF"/);
    expect(await loadSchema("ANECF")).toMatch(/<xs:element name="ANECF"/);
    expect(await loadSchema("ACECF")).toMatch(/<xs:element name="ACECF"/);
  });
});

describe("integridad: son los bytes que sirvió la DGII", () => {
  it("los catorce checksums cuadran", async () => {
    const resultados = await verifySchemaIntegrity();
    const rotos = resultados.filter((r) => !r.ok);
    expect(
      rotos.map((r) => `${r.key}: esperado ${r.expected.slice(0, 12)}… vino ${r.actual?.slice(0, 12) ?? "nada"}…`),
      "Un esquema cambió. Si fue a propósito, actualiza SCHEMA_CHECKSUMS y docs/dgii/xsd/README.md.",
    ).toEqual([]);
  });

  it("hay checksum para todo lo registrado", () => {
    for (const k of [...ECF_TYPES, ...AUX_SCHEMAS]) {
      expect(SCHEMA_CHECKSUMS[k], k).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("ningún esquema comparte checksum con otro", () => {
    // Dos iguales significaría que alguien copió un archivo sobre otro.
    const valores = Object.values(SCHEMA_CHECKSUMS);
    expect(new Set(valores).size).toBe(valores.length);
  });
});

describe("pedir un esquema que no existe", () => {
  it("falla en vez de devolver otro", async () => {
    // Devolver el del 31 «por si acaso» produciría validaciones que no
    // significan nada.
    await expect(loadSchemaForEcfType("99")).rejects.toThrow(SchemaNotFound);
    await expect(loadSchemaForEcfType("")).rejects.toThrow(SchemaNotFound);
  });
});

describe("los esquemas nuevos se pueden usar de verdad", () => {
  it("xmllint los acepta como esquema", async () => {
    // Que el archivo exista no basta: tiene que COMPILAR. Se prueba validando
    // un XML deliberadamente incorrecto — si el esquema no compilara,
    // `validateEcfXml` lanzaría en vez de devolver `valid: false`.
    for (const tipo of ["41", "45", "47"] as const) {
      const xsd = await loadSchemaForEcfType(tipo);
      const r = await validateEcfXml({ xml: "<ECF></ECF>", xsd });
      expect(r.valid, tipo).toBe(false);
      expect(r.errors.length, tipo).toBeGreaterThan(0);
    }
  }, 30_000);

  it("el parche del BOM y del typo no rompe los esquemas nuevos", async () => {
    for (const tipo of ECF_TYPES) {
      const xsd = await loadSchemaForEcfType(tipo);
      const parcheado = patchOfficialDgiiXsd(xsd);
      expect(parcheado.startsWith("﻿"), `${tipo} conserva BOM`).toBe(false);
      expect(parcheado, tipo).toContain("xs:schema");
    }
  });
});
