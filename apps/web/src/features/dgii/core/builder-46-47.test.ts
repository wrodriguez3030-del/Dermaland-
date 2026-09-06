// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import type { BuildEcfXmlInput } from "./builder-types";

/**
 * v353 — Builders 46 (Exportaciones) y 47 (Pagos al Exterior), literales a sus
 * XSD oficiales (FIELD_MATRIX_41_45.md §46/§47). ANCLA: el XML construido pasa
 * el XSD oficial real. 46 = gravado tramo 3 tasa 0% (indicador "3", SIN
 * MontoExento); 47 = exento con Retencion OBLIGATORIA (MontoISRRetenido
 * requerido, sin MontoITBISRetenido) y comprador SOLO extranjero.
 * Postulación declarable SIGUE 31-34.
 */

const WILDCARD_RE = /Signature|Missing child element\(s\)\. Expected is one of \( \{?\*/;
const EMISOR = { rnc: "131793916", razonSocial: "Prueba SRL", direccion: "Calle 1 #1, Santiago" };

function base46(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "46",
    eNcf: "E460000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    comprador: { identificadorExtranjero: "US-EIN-12345", razonSocial: "Foreign Buyer LLC", pais: "Estados Unidos" },
    items: [{ nombre: "Exportación de servicios", cantidad: 1, precioUnitario: 5000, itbisRate: 0, indicadorBienoServicio: "2" }],
    ...over,
  };
}

function base47(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "47",
    eNcf: "E470000000001",
    fechaEmision: "2026-07-10T12:00:00Z",
    fechaVencimientoSecuencia: "2027-12-31T00:00:00Z",
    ambiente: "testecf",
    emisor: EMISOR,
    comprador: { identificadorExtranjero: "PASSPORT-XY99", razonSocial: "Non Resident Provider Ltd" },
    items: [
      {
        nombre: "Pago por servicios técnicos del exterior",
        cantidad: 1,
        precioUnitario: 2000,
        itbisRate: 0,
        retencion: { indicadorAgente: "1", montoIsrRetenido: 540 },
      },
    ],
    ...over,
  };
}

async function xsdErrors(xml: string, tipo: string): Promise<string[]> {
  const res = await validateEcfXml({ xml, xsd: await loadXsdForTipo(tipo), schemaName: `e-CF-${tipo}` });
  return res.errors.filter((e) => !WILDCARD_RE.test(e.message)).map((e) => e.message);
}

describe("v353 — E46 (Exportaciones): el XML pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD; tramo 3 tasa 0%, comprador extranjero con país", async () => {
    const r = buildEcfXml(base46());
    expect(await xsdErrors(r.xml, "46")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>46</TipoeCF>");
    expect(r.xml).toContain("<IndicadorFacturacion>3</IndicadorFacturacion>"); // tramo ITBIS3 0%
    expect(r.xml).toContain("<IdentificadorExtranjero>US-EIN-12345</IdentificadorExtranjero>");
    expect(r.xml).toContain("<PaisComprador>Estados Unidos</PaisComprador>");
    expect(r.xml).toContain("<MontoGravadoI3>5000.00</MontoGravadoI3>");
    expect(r.xml).toContain("<TotalITBIS3>0.00</TotalITBIS3>");
    expect(r.xml).not.toContain("<MontoExento>"); // NO existe en Totales del 46
    expect(r.xml).toContain("<TipoIngresos>"); // 46 SÍ lo lleva (como 31)
    expect(r.xml).toContain("<MontoTotal>5000.00</MontoTotal>");
  });

  it("inválidos fail-closed: ITBIS>0, sin razón social, retención, país en otro tipo", () => {
    expect(() => buildEcfXml(base46({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 18 }] }))).toThrow(/tasa 0%/);
    expect(() => buildEcfXml(base46({ comprador: { identificadorExtranjero: "X-1" } }))).toThrow(/RazonSocialComprador/);
    expect(() =>
      buildEcfXml(base46({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, retencion: { indicadorAgente: "1" } }] })),
    ).toThrow(/41 y 47/);
    expect(() => buildEcfXml({ ...base46(), tipoEcf: "31", eNcf: "E310000000001", comprador: { rncOCedula: "101000001", razonSocial: "X", pais: "USA" } })).toThrow(/PaisComprador solo existe/);
  });
});

describe("v353 — E47 (Pagos al Exterior): el XML pasa el XSD OFICIAL", () => {
  it("fixture válido → cero errores XSD; Retencion obligatoria con ISR, sin RNC comprador, sin TipoIngresos", async () => {
    const r = buildEcfXml(base47());
    expect(await xsdErrors(r.xml, "47")).toEqual([]);
    expect(r.xml).toContain("<TipoeCF>47</TipoeCF>");
    expect(r.xml).toContain("<MontoISRRetenido>540.00</MontoISRRetenido>");
    expect(r.xml).toContain("<TotalISRRetencion>540.00</TotalISRRetencion>");
    expect(r.xml).toContain("<IdentificadorExtranjero>PASSPORT-XY99</IdentificadorExtranjero>");
    expect(r.xml).not.toContain("<RNCComprador>");
    expect(r.xml).not.toContain("<TipoIngresos>");
    expect(r.xml).not.toContain("<MontoITBISRetenido>"); // NO existe en el XSD 47
    expect(r.xml).toContain("<MontoExento>2000.00</MontoExento>");
    expect(r.xml).toContain("<MontoTotal>2000.00</MontoTotal>");
  });

  it("inválidos fail-closed: sin retención, sin ISR, con ITBIS retenido, con RNC, con descuento", () => {
    expect(() => buildEcfXml(base47({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0 }] }))).toThrow(/requiere Retencion/);
    expect(() =>
      buildEcfXml(base47({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, retencion: { indicadorAgente: "1" } }] })),
    ).toThrow(/MontoISRRetenido/);
    expect(() =>
      buildEcfXml(base47({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, retencion: { indicadorAgente: "1", montoIsrRetenido: 5, montoItbisRetenido: 2 } }] })),
    ).toThrow(/no tiene MontoITBISRetenido/);
    expect(() => buildEcfXml(base47({ comprador: { rncOCedula: "101000001", razonSocial: "X" } }))).toThrow(/no tiene RNCComprador/);
    expect(() =>
      buildEcfXml(base47({ items: [{ nombre: "x", cantidad: 1, precioUnitario: 10, itbisRate: 0, descuento: 1, retencion: { indicadorAgente: "1", montoIsrRetenido: 1 } }] })),
    ).toThrow(/DescuentoMonto/);
  });
});

describe("v353 — cross-schema y honestidad final", () => {
  it("E46 no valida como 47 ni viceversa; los 10 tipos tienen builder; postulación SIGUE 31-34", async () => {
    const x46 = buildEcfXml(base46()).xml;
    const x47 = buildEcfXml(base47()).xml;
    expect((await xsdErrors(x46, "47")).length).toBeGreaterThan(0);
    expect((await xsdErrors(x47, "46")).length).toBeGreaterThan(0);
    const { ECF_TIPOS_BUILDER, ECF_TIPOS_RESERVADOS } = await import("./builder-types");
    expect([...ECF_TIPOS_BUILDER]).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]);
    expect([...ECF_TIPOS_RESERVADOS]).toEqual([]);
    const { SUPPORTED_ECF_TIPOS } = await import("./postulacion-content");
    expect([...SUPPORTED_ECF_TIPOS]).toEqual(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]); // v368: postulación ALL-TYPES autorizada (42 excluido)
  }, 60_000);

  it("tipo 42 y desconocidos siguen fail-closed en el builder", () => {
    for (const t of ["42", "99"]) {
      expect(() => buildEcfXml({ ...base46(), tipoEcf: t as never, eNcf: `E${t}0000000001` })).toThrow(/inválido/);
    }
  });
});
