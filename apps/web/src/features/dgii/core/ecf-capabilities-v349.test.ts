// Portada de agendapp: tests/unit/dgii-ecf-capabilities-v349.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadXsdForTipo, isKnownXsdTipo, resolveXsdPath } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import { EcfValidatorError } from "./validator-types";
import { buildEcfXml } from "./builder";
import {
  ECF_TIPOS_OBJETIVO,
  getEcfSoftwareCapabilities,
  getDeclarableTipos,
  isEcfTipoObjetivo,
  isEmitibleTipo,
  capabilityInvariantIssues,
} from "./ecf-capabilities";
import { SUPPORTED_ECF_TIPOS } from "./postulacion-content";
import { rutaPortada } from "./__port__/rutas";

/**
 * v349 — XSD oficiales 41/43/44/45/46/47 (descargados de dgii.gov.do 2026-07-10,
 * SHA256 en docs/dgii/xsd/SOURCE.md) + matriz de capacidades HONESTA:
 *  - la capa XSD (validación/recepción de entrantes) ahora cubre los 10 tipos;
 *  - la capa de EMISIÓN sigue siendo 31-34 (ECF_TIPOS_BUILDER) — sin soporte falso;
 *  - la postulación DECLARABLE sigue siendo exactamente 31,32,33,34;
 *  - cross-schema fail-closed: un e-CF de un tipo NO valida contra el XSD de otro.
 */

const SHA256_OFICIALES: Record<string, string> = {
  "41": "eae1993c637375bc1cbe80932411d87f5680cd54e77e4d1b2752d72a6c8b2ab3",
  "43": "776f030980c2c50cf0221e9263c55f367c8631727adff00ab45e2c7c1abafc52",
  "44": "19834f37a9f0e2db40f00c80d07c2bf92f9019f23474480f32cef1ba06af4e67",
  "45": "030492cc8ef7d1a09a89b16b241f8e5c4920dfd09c0b629b1db8e68406ecd6ca",
  "46": "e7f8613ade25c7efb88e84d34d7c0ad330d1b22238ad9ef90c80aed01911d67b",
  "47": "14daf18f52f63dd80e439a18fb60a102d74e71243ee90ee253367f61ce8e1994",
};

const NUEVOS = ["41", "43", "44", "45", "46", "47"] as const;

function buildValid31Xml(): string {
  return buildEcfXml({
    tipoEcf: "31",
    eNcf: "E310000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: { rnc: "131793916", razonSocial: "Prueba SRL", direccion: "Calle 1 #1, Santiago" },
    comprador: { rncOCedula: "101000001", razonSocial: "Cliente SRL" },
    items: [{ nombre: "Servicio de prueba", cantidad: 1, precioUnitario: 100, itbisRate: 18, indicadorBienoServicio: "2" }],
  }).xml;
}

describe("v349 — XSD oficiales 41-47: integridad, carga y compilación", () => {
  it("los 6 archivos en disco tienen EXACTAMENTE el SHA256 de la descarga oficial (provenance amarrada)", () => {
    for (const t of NUEVOS) {
      const raw = readFileSync(rutaPortada(`docs/dgii/xsd/e-CF-${t}-v1.0.xsd`));
      expect(createHash("sha256").update(raw).digest("hex"), `SHA256 tipo ${t}`).toBe(SHA256_OFICIALES[t]);
    }
  });

  it("isKnownXsdTipo reconoce los 10 tipos objetivo; 42/99/traversal siguen rechazados", () => {
    for (const t of ECF_TIPOS_OBJETIVO) expect(isKnownXsdTipo(t), `tipo ${t}`).toBe(true);
    for (const t of ["42", "99", "", "abc", "../31"]) expect(isKnownXsdTipo(t)).toBe(false);
    expect(() => resolveXsdPath("42")).toThrow(EcfValidatorError);
  });

  it("loadXsdForTipo carga los 6 nuevos: BOM removido en memoria, root ECF presente", async () => {
    for (const t of NUEVOS) {
      const xsd = await loadXsdForTipo(t);
      expect(xsd.charCodeAt(0), `BOM tipo ${t}`).not.toBe(0xfeff);
      expect(xsd.startsWith("<?xml")).toBe(true);
      expect(xsd).toContain('element name="ECF"');
    }
  });

  it("los 6 XSD COMPILAN en el validador canónico (errores de elemento, jamás 'parser error')", async () => {
    const xml31 = buildValid31Xml();
    for (const t of NUEVOS) {
      const xsd = await loadXsdForTipo(t);
      const res = await validateEcfXml({ xml: xml31, xsd, schemaName: `e-CF-${t}` });
      // Cross-schema fail-closed: un e-CF 31 válido NO pasa el XSD de otro tipo…
      expect(res.ok, `XML 31 no debe validar contra XSD ${t}`).toBe(false);
      // …y el motivo es de VALIDACIÓN (schema compiló), no de compilación del schema.
      const msgs = res.errors.map((e) => e.message).join(" | ");
      expect(msgs).not.toMatch(/parser error|failed to load|Schemas parser/i);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("regresión: el e-CF 31 canónico SIGUE validando contra su propio XSD", async () => {
    const res = await validateEcfXml({ xml: buildValid31Xml(), xsd: await loadXsdForTipo("31"), schemaName: "e-CF-31" });
    // El XSD exige <Signature> (xs:any minOccurs=1) al final; el builder emite
    // SIN firma — el único error tolerado es el del wildcard xs:any faltante
    // ("Missing child element(s). Expected is one of ( {*}*"), contrato Fase 4/5.
    const otros = res.errors.filter(
      (e) => !/Signature/i.test(e.message) && !/Missing child element\(s\)\. Expected is one of \( \{?\*/.test(e.message),
    );
    expect(otros).toEqual([]);
  }, 30_000);
});

describe("v349 — matriz de capacidades honesta (composición, sin listas nuevas)", () => {
  it("reconoce exactamente los 10 tipos objetivo; 42 y desconocidos fail-closed", () => {
    expect([...ECF_TIPOS_OBJETIVO]).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]);
    expect(isEcfTipoObjetivo("42")).toBe(false);
    expect(isEcfTipoObjetivo("")).toBe(false);
  });

  it("v368: LOS 10 READY/declarables (postulación ALL-TYPES autorizada); certificación sigue en su matriz", () => {
    const byTipo = Object.fromEntries(getEcfSoftwareCapabilities().map((c) => [c.tipo, c]));
    for (const t of ["31", "32", "33", "34"]) {
      expect(byTipo[t], t).toMatchObject({ estado: "READY", emitible: true, declarable: true, xsdReady: true, builderReady: true });
    }
    for (const t of ["41", "43", "44", "45", "46", "47"]) {
      expect(byTipo[t], t).toMatchObject({ estado: "READY", emitible: true, declarable: true, builderReady: true });
      expect(isEmitibleTipo(t)).toBe(true);
    }
  });

  it("postulación declarable = LOS 10 (getDeclarableTipos() ≡ SUPPORTED_ECF_TIPOS; v368 autorizada)", () => {
    expect(getDeclarableTipos()).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]);
    expect(getDeclarableTipos()).toEqual([...SUPPORTED_ECF_TIPOS]);
  });

  it("invariantes internas sin conflictos (reservados vs builder, declarable⊆emitible⊆xsd)", () => {
    expect(capabilityInvariantIssues()).toEqual([]);
  });

  it("el builder canónico rechaza 42 y tipos desconocidos (fail-closed; ya no quedan reservados)", () => {
    for (const t of ["42", "99"]) {
      expect(() =>
        buildEcfXml({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tipoEcf: t as any,
          eNcf: `E${t}0000000001`,
          fechaEmision: "2026-07-10T12:00:00Z",
          ambiente: "testecf",
          emisor: { rnc: "131793916", razonSocial: "X", direccion: "Y" },
          items: [{ nombre: "i", cantidad: 1, precioUnitario: 1, itbisRate: 18 }],
        }),
      ).toThrow(/inválido/i);
    }
  });
});
