// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import type { BuildEcfXmlInput } from "./builder-types";

/**
 * v351 — Builders 41 (Compras) y 43 (Gastos Menores), implementados literalmente
 * contra sus XSD oficiales (docs/dgii/xsd/FIELD_MATRIX_41_45.md). El ANCLA de
 * verificación: el XML construido VALIDA contra el XSD oficial real (xmllint) —
 * el único error tolerado es el del wildcard xs:any de la <Signature> (Fase 6).
 * Además: la postulación declarable NO cambió (sigue 31-34 — sin soporte falso).
 */

const WILDCARD_RE = /Signature|Missing child element\(s\)\. Expected is one of \( \{?\*/;

const EMISOR = { rnc: "131793916", razonSocial: "Prueba SRL", direccion: "Calle 1 #1, Santiago" };

function base41(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "41",
    eNcf: "E410000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    comprador: { rncOCedula: "101000001", razonSocial: "Proveedor Informal SRL" },
    items: [
      {
        nombre: "Compra de insumos",
        cantidad: 2,
        precioUnitario: 500,
        itbisRate: 18,
        retencion: { indicadorAgente: "1", montoItbisRetenido: 54, montoIsrRetenido: 100 },
      },
    ],
    ...over,
  };
}

function base43(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "43",
    eNcf: "E430000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    items: [{ nombre: "Gasto menor de transporte", cantidad: 1, precioUnitario: 350, itbisRate: 0 }],
    ...over,
  };
}

async function xsdErrors(xml: string, tipo: string): Promise<string[]> {
  const res = await validateEcfXml({ xml, xsd: await loadXsdForTipo(tipo), schemaName: `e-CF-${tipo}` });
  return res.errors.filter((e) => !WILDCARD_RE.test(e.message)).map((e) => e.message);
}

describe("v351 — E41 (Compras): el XML construido pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD (salvo Signature); estructura clave presente", async () => {
    const r = buildEcfXml(base41());
    expect(await xsdErrors(r.xml, "41")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>41</TipoeCF>");
    expect(r.xml).toContain("<Retencion>");
    expect(r.xml).toContain("<IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>");
    expect(r.xml).toContain("<TotalITBISRetenido>54.00</TotalITBISRetenido>");
    expect(r.xml).toContain("<TotalISRRetencion>100.00</TotalISRRetencion>");
    expect(r.xml).not.toContain("<TipoIngresos>"); // el elemento NO existe en el XSD 41
    expect(r.totals.total).toBe(1180); // 1000 + 18% ITBIS (la retención no altera MontoTotal)
  });

  it("inválidos fail-closed: sin retención por ítem, sin RNC comprador, indicador inválido, monto negativo, eNCF mismatch", () => {
    expect(() => buildEcfXml(base41({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18 }] }))).toThrow(/Retencion/);
    expect(() => buildEcfXml(base41({ comprador: { razonSocial: "Sin RNC" } }))).toThrow(/RNCComprador/);
    expect(() =>
      buildEcfXml(base41({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18, retencion: { indicadorAgente: "9" as never } }] })),
    ).toThrow(/IndicadorAgenteRetencionoPercepcion/);
    expect(() =>
      buildEcfXml(base41({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18, retencion: { indicadorAgente: "1", montoIsrRetenido: -5 } }] })),
    ).toThrow(/negativo/);
    expect(() => buildEcfXml(base41({ eNcf: "E310000000001" }))).toThrow(/no coincide con el tipo/);
  });
});

describe("v351 — E43 (Gastos Menores): el XML construido pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD (salvo Signature); sin Comprador ni ITBIS", async () => {
    const r = buildEcfXml(base43());
    expect(await xsdErrors(r.xml, "43")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>43</TipoeCF>");
    expect(r.xml).not.toContain("<Comprador>"); // el bloque NO existe en el XSD 43
    expect(r.xml).not.toContain("<TotalITBIS>");
    expect(r.xml).not.toContain("<MontoGravadoTotal>");
    expect(r.xml).not.toContain("<TipoIngresos>");
    expect(r.xml).toContain("<MontoExento>350.00</MontoExento>");
    expect(r.xml).toContain("<MontoTotal>350.00</MontoTotal>");
  });

  it("inválidos fail-closed: ITBIS>0, descuento, retención en ítem, eNCF mismatch", () => {
    expect(() => buildEcfXml(base43({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18 }] }))).toThrow(/no lleva ITBIS/);
    expect(() => buildEcfXml(base43({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, descuento: 2 }] }))).toThrow(/DescuentoMonto/);
    expect(() =>
      buildEcfXml(base43({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, retencion: { indicadorAgente: "1" } }] })),
    ).toThrow(/solo existe en los tipos 41 y 47/);
    expect(() => buildEcfXml(base43({ eNcf: "E410000000001" }))).toThrow(/no coincide con el tipo/);
  });
});

describe("v351 — cross-schema y honestidad (sin soporte falso)", () => {
  it("el XML 41 NO valida contra el XSD 43 ni viceversa (fail-closed real)", async () => {
    const x41 = buildEcfXml(base41()).xml;
    const x43 = buildEcfXml(base43()).xml;
    expect((await xsdErrors(x41, "43")).length).toBeGreaterThan(0);
    expect((await xsdErrors(x43, "41")).length).toBeGreaterThan(0);
  }, 60_000);

  it("regresión 31/33/34: sin retención permitida y FechaVencimientoSecuencia intacta; 42 fail-closed", async () => {
    const { SUPPORTED_ECF_TIPOS } = await import("./postulacion-content");
    expect([...SUPPORTED_ECF_TIPOS]).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]); // v368: postulación ALL-TYPES autorizada (42 excluido)
    expect(() =>
      buildEcfXml(base41({ tipoEcf: "31", eNcf: "E310000000001" })),
    ).toThrow(/solo existe en los tipos 41 y 47/); // retención en 31 → rechazada
    // v353: ya no quedan reservados; 42/desconocidos siguen fail-closed.
    expect(() => buildEcfXml({ ...base43(), tipoEcf: "42" as never, eNcf: "E420000000001" })).toThrow(/inválido/);
  });
});
