// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import type { BuildEcfXmlInput } from "./builder-types";

/**
 * v352 — Builders 44 (Regímenes Especiales) y 45 (Gubernamental), literales a
 * sus XSD oficiales (FIELD_MATRIX_41_45.md). ANCLA: el XML construido pasa el
 * XSD oficial real (único error tolerado: wildcard Signature). Postulación
 * declarable SIGUE 31-34 (sin soporte falso).
 */

const WILDCARD_RE = /Signature|Missing child element\(s\)\. Expected is one of \( \{?\*/;
const EMISOR = { rnc: "131793916", razonSocial: "Prueba SRL", direccion: "Calle 1 #1, Santiago" };

function base44(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "44",
    eNcf: "E440000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    // 44: receptor de régimen especial — RNC OPCIONAL, RazonSocial obligatoria.
    comprador: { razonSocial: "Zona Franca Industrial XYZ" },
    items: [{ nombre: "Servicio exento régimen especial", cantidad: 1, precioUnitario: 1000, itbisRate: 0, indicadorBienoServicio: "2" }],
    ...over,
  };
}

function base45(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "45",
    eNcf: "E450000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    // 45: receptor gubernamental — RNC OBLIGATORIO.
    comprador: { rncOCedula: "401000001", razonSocial: "Ministerio Demo" },
    items: [{ nombre: "Servicio a entidad estatal", cantidad: 2, precioUnitario: 750, itbisRate: 18, indicadorBienoServicio: "2" }],
    ...over,
  };
}

async function xsdErrors(xml: string, tipo: string): Promise<string[]> {
  const res = await validateEcfXml({ xml, xsd: await loadXsdForTipo(tipo), schemaName: `e-CF-${tipo}` });
  return res.errors.filter((e) => !WILDCARD_RE.test(e.message)).map((e) => e.message);
}

describe("v352 — E44 (Regímenes Especiales): el XML pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD; todo exento, sin campos ITBIS, receptor sin RNC", async () => {
    const r = buildEcfXml(base44());
    expect(await xsdErrors(r.xml, "44")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>44</TipoeCF>");
    expect(r.xml).toContain("<TipoIngresos>"); // 44 SÍ lleva TipoIngresos (como 31)
    expect(r.xml).not.toContain("<TotalITBIS>");
    expect(r.xml).not.toContain("<MontoGravadoTotal>");
    expect(r.xml).not.toContain("<RNCComprador>"); // opcional y no provisto
    expect(r.xml).toContain("<RazonSocialComprador>Zona Franca Industrial XYZ</RazonSocialComprador>");
    expect(r.xml).toContain("<MontoExento>1000.00</MontoExento>");
    expect(r.xml).toContain("<MontoTotal>1000.00</MontoTotal>");
  });

  it("inválidos fail-closed: ITBIS>0, sin razón social, eNCF mismatch", () => {
    expect(() => buildEcfXml(base44({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18 }] }))).toThrow(/todo exento/);
    expect(() => buildEcfXml(base44({ comprador: { rncOCedula: "101000001" } }))).toThrow(/RazonSocialComprador/);
    expect(() => buildEcfXml(base44({ eNcf: "E450000000001" }))).toThrow(/no coincide con el tipo/);
  });
});

describe("v352 — E45 (Gubernamental): el XML pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD; ITBIS completo permitido; RNC estatal obligatorio", async () => {
    const r = buildEcfXml(base45());
    expect(await xsdErrors(r.xml, "45")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>45</TipoeCF>");
    expect(r.xml).toContain("<RNCComprador>401000001</RNCComprador>");
    expect(r.xml).toContain("<MontoGravadoTotal>1500.00</MontoGravadoTotal>");
    expect(r.xml).toContain("<TotalITBIS>270.00</TotalITBIS>");
    expect(r.xml).toContain("<MontoTotal>1770.00</MontoTotal>");
    expect(r.xml).not.toContain("<TotalITBISRetenido>"); // 45 no tiene retenciones (XSD)
  });

  it("inválidos fail-closed: sin RNC receptor, retención en ítem, eNCF mismatch", () => {
    expect(() => buildEcfXml(base45({ comprador: { razonSocial: "Sin RNC" } }))).toThrow(/RNCComprador/);
    expect(() =>
      buildEcfXml(base45({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18, retencion: { indicadorAgente: "1" } }] })),
    ).toThrow(/solo existe en los tipos 41 y 47/);
    expect(() => buildEcfXml(base45({ eNcf: "E440000000001" }))).toThrow(/no coincide con el tipo/);
  });
});

describe("v352 — cross-schema y honestidad", () => {
  it("E44 no valida como 45 ni viceversa; postulación sigue 31-34", async () => {
    const x44 = buildEcfXml(base44()).xml;
    const x45 = buildEcfXml(base45()).xml;
    expect((await xsdErrors(x44, "45")).length).toBeGreaterThan(0);
    expect((await xsdErrors(x45, "44")).length).toBeGreaterThan(0);
    const { SUPPORTED_ECF_TIPOS } = await import("./postulacion-content");
    expect([...SUPPORTED_ECF_TIPOS]).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]); // v368: postulación ALL-TYPES autorizada (42 excluido)
  }, 60_000);
});
