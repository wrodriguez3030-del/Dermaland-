// Portada de agendapp: tests/unit/dgii-fidelity-fixes-v389.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildEcfXml } from "./builder";
import type { BuildEcfXmlInput } from "./builder-types";
import { signEcfXml } from "./signer";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import { getDummyCert } from "./__port__/dgii-test-cert";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v389 — Cierre de fidelidad 29/29: campos que faltaban en el builder (Totales ValorPagar/
 * MontoPeriodo; Comprador ContactoEntrega/DireccionEntrega/TelefonoAdicional; IdDoc
 * FechaLimitePago/TerminoPago; InformacionesAdicionales/Transporte para 31/32/33/34/44/45/46/47;
 * retención OFICIAL pass-through; TipoCambio/CantidadBulto/VolumenBulto lexical).
 */
const { certificatePem, privateKeyPem } = getDummyCert();

function e31(over: Partial<BuildEcfXmlInput> = {}): BuildEcfXmlInput {
  return {
    tipoEcf: "31", eNcf: "E310000000001", fechaEmision: "2020-04-01", fechaVencimientoSecuencia: "2028-12-31",
    ambiente: "testecf", tipoIngresos: "01", tipoPago: "1",
    emisor: { rnc: "131561985", razonSocial: "EMISOR", direccion: "Calle 1" },
    comprador: { rncOCedula: "101023122", razonSocial: "COMP" },
    items: [{ nombre: "ITEM", cantidad: 1, precioUnitario: 100, itbisRate: 18 }],
    ...over,
  };
}

describe("v389 — nuevos campos emitidos + XSD sigue verde", () => {
  it("Totales ValorPagar/MontoPeriodo + Comprador entrega + IdDoc pago", () => {
    const { xml } = buildEcfXml(e31({
      valorPagar: 1770, montoPeriodo: 500, terminoPago: "1", fechaLimitePago: "2020-05-10",
      comprador: { rncOCedula: "101023122", razonSocial: "COMP", contactoEntrega: "JUAN", direccionEntrega: "Av 2", telefonoAdicional: "809-111-2222" },
    }));
    expect(xml).toContain("<ValorPagar>1770.00</ValorPagar>");
    expect(xml).toContain("<MontoPeriodo>500.00</MontoPeriodo>");
    expect(xml).toContain("<ContactoEntrega>JUAN</ContactoEntrega>");
    expect(xml).toContain("<DireccionEntrega>Av 2</DireccionEntrega>");
    expect(xml).toContain("<TelefonoAdicional>809-111-2222</TelefonoAdicional>");
    expect(xml).toContain("<FechaLimitePago>10-05-2020</FechaLimitePago>");
    expect(xml).toContain("<TerminoPago>1</TerminoPago>");
  });
  it("v390 — E31 NO emite Transporte/InformacionesAdicionales aunque el input lo traiga (revertido: DGII rechaza formato en e-CF doméstico) + XSD PASS", async () => {
    const { xml } = buildEcfXml(e31({ transporte: { numeroContenedor: "8019289", numeroReferencia: "1447", conductor: "PEDRO", placa: "A123456" } }));
    expect(xml).not.toContain("<InformacionesAdicionales>");
    expect(xml).not.toContain("<NumeroContenedor>");
    expect(xml).not.toContain("<Transporte>");
    const { signedXml } = signEcfXml({ xml, certificatePem, privateKeyPem });
    const res = await validateEcfXml({ xml: signedXml, xsd: await loadXsdForTipo("31"), schemaName: "e-CF-31" });
    expect(res.ok).toBe(true);
  });
  it("TipoCambio lexical (56.3000) preserva escala en E31 (OtraMoneda, no transporte)", () => {
    const { xml } = buildEcfXml(e31({ otraMoneda: { tipoMoneda: "USD", tipoCambio: 56.3, tipoCambioLexical: "56.3000" } }));
    expect(xml).toContain("<TipoCambio>56.3000</TipoCambio>");
  });
  it("retención OFICIAL pass-through (evita el redondeo de 0.01)", () => {
    const { xml } = buildEcfXml({
      ...e31({ tipoEcf: "41", eNcf: "E410000000007" }),
      totalItbisRetenido: 2846.53, totalIsrRetenido: 1606.41,
      items: [{ nombre: "I", cantidad: 1, precioUnitario: 100, itbisRate: 18, retencion: { indicadorAgente: "1", montoItbisRetenido: 2846.54, montoIsrRetenido: 1606.42 } }],
    });
    expect(xml).toContain("<TotalITBISRetenido>2846.53</TotalITBISRetenido>");
    expect(xml).toContain("<TotalISRRetencion>1606.41</TotalISRRetencion>");
  });
});

// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/(dashboard)/settings/dgii/setup/_components/OfficialDatasetPanel.tsx, que DermaLand aún no tiene.
// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/api/dgii/certification/dataset/audit-fidelity/route.ts, que DermaLand aún no tiene.
// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/certification-dataset-service.ts, que DermaLand aún no tiene.
describe.skip("v389 — acción de auditoría server-side", () => {
  const svc = leerSiExiste("src/lib/dgii/certification-dataset-service.ts", "utf8");
  const route = leerSiExiste("src/app/api/dgii/certification/dataset/audit-fidelity/route.ts", "utf8");
  const panel = leerSiExiste("src/app/(dashboard)/settings/dgii/setup/_components/OfficialDatasetPanel.tsx", "utf8");
  it("auditDatasetFidelity corre el comparador contra el workbook (no firma/envía)", () => {
    expect(svc).toContain("export async function auditDatasetFidelity");
    expect(svc).toContain("compareOfficialCaseToXml");
  });
  it("la ruta es Node + session + RBAC dgii", () => {
    expect(route).toContain('runtime = "nodejs"');
    expect(route).toContain("getBusinessContext");
    expect(route).toContain("requireCanWrite");
    expect(route).toContain("auditDatasetFidelity");
  });
  it("la UI ofrece 'Auditar fidelidad' + muestra X/N", () => {
    expect(panel).toContain("Auditar fidelidad de los casos");
    expect(panel).toContain("/api/dgii/certification/dataset/audit-fidelity");
    expect(panel).toContain("Fidelidad e-CF");
  });
});
