// Portada de agendapp: tests/unit/dgii-compliance-v335.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isoToDgiiDate, isoToDgiiDateTime } from "./xml-utils";
import { buildEcfXml } from "./builder";
import { EcfBuilderInvalidInput } from "./builder-types";
import {
  extractSignatureValue,
  securityCodeFromSignedXml,
  buildConsultaTimbreUrl,
  buildConsultaTimbreFcUrl,
  DGII_QR_SPEC,
} from "./print-representation";
import { DGII_PATHS, DGII_FC_BASE_URLS, DGII_RECEPCION_FC_PATH } from "./dgii-client-types";
import { rutaPortada } from "./__port__/rutas";

/**
 * v335 — Compliance contra documentación OFICIAL vigente (verificada 2026-07-09):
 *  - Formato e-CF v1.0: FechaHoraFirma "dd-MM-AAAA HH:mm:ss; Zona horaria GMT -4".
 *  - XSD e-CF-33-v1.0: InformacionReferencia minOccurs=1 (obligatoria en Nota de Débito).
 *  - Informe Técnico e-CF v1.0 §18: código de seguridad + URL de ConsultaTimbre + QR v8.
 *  - Descripción Técnica Servicios DGII: aprobacioncomercial/anulacionrangos/fc.dgii.gov.do.
 */

const readSrc = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

const baseInput = (over: Record<string, unknown> = {}) => ({
  tipoEcf: "32" as const,
  eNcf: "E320000000001",
  fechaEmision: "2026-07-09T12:00:00Z",
  ambiente: "testecf" as const,
  emisor: { rnc: "130123456", razonSocial: "Mi Negocio SRL", direccion: "Calle 1, Santiago" },
  items: [{ nombre: "Servicio A", cantidad: 1, precioUnitario: 100, itbisRate: 18 }],
  ...over,
});

// ── GMT-4 (oficial) ──────────────────────────────────────────────────────────

describe("v335 — fechas en hora dominicana (GMT-4, Formato e-CF v1.0)", () => {
  it("un instante de madrugada UTC es el día ANTERIOR en RD (bug original)", () => {
    // 01:30 UTC del 9 de julio = 21:30 del 8 de julio en RD.
    expect(isoToDgiiDate("2026-07-09T01:30:00Z")).toBe("08-07-2026");
    expect(isoToDgiiDateTime("2026-07-09T01:30:00Z")).toBe("08-07-2026 21:30:00");
  });

  it("mediodía UTC cae el mismo día (08:00 RD)", () => {
    expect(isoToDgiiDateTime("2026-07-09T12:00:00Z")).toBe("09-07-2026 08:00:00");
  });

  it("fechas de CALENDARIO (YYYY-MM-DD) se respetan sin corrimiento", () => {
    expect(isoToDgiiDate("2026-12-31")).toBe("31-12-2026");
    expect(isoToDgiiDate("2026-01-01")).toBe("01-01-2026");
  });

  it("el e-CF emitido de noche en RD lleva la fecha local, no la UTC", () => {
    const r = buildEcfXml(baseInput({ fechaEmision: "2026-07-09T01:30:00Z" }));
    expect(r.xml).toContain("<FechaEmision>08-07-2026</FechaEmision>");
    expect(r.xml).toContain("<FechaHoraFirma>08-07-2026 21:30:00</FechaHoraFirma>");
  });
});

// ── E33: referencia obligatoria (XSD oficial) ────────────────────────────────

describe("v335 — E33 exige InformacionReferencia (XSD e-CF-33 minOccurs=1)", () => {
  const input33 = (referencia?: unknown) =>
    baseInput({
      tipoEcf: "33",
      eNcf: "E330000000001",
      fechaVencimientoSecuencia: "2026-12-31",
      ...(referencia ? { referencia } : {}),
    });

  it("sin referencia → error del builder (antes era solo warning)", () => {
    expect(() => buildEcfXml(input33())).toThrow(EcfBuilderInvalidInput);
    expect(() => buildEcfXml(input33())).toThrow(/Tipo 33.*ncfModificado/);
  });

  it("con referencia completa → XML válido con InformacionReferencia", () => {
    const r = buildEcfXml(
      input33({ ncfModificado: "E310000000009", fechaNcfModificado: "2026-05-01", codigoModificacion: "2" }),
    );
    expect(r.xml).toContain("<InformacionReferencia>");
    expect(r.xml).toContain("<NCFModificado>E310000000009</NCFModificado>");
    expect(r.xml).not.toContain("IndicadorNotaCredito"); // solo el 34 lo lleva (XSD)
  });

  it("referencia sin CodigoModificacion → error", () => {
    expect(() => buildEcfXml(input33({ ncfModificado: "E310000000009", fechaNcfModificado: "2026-05-01" }))).toThrow(
      /CodigoModificacion/,
    );
  });
});

// ── maxLength tempranos ──────────────────────────────────────────────────────

describe("v335 — maxLength del XSD validados temprano con mensaje claro", () => {
  it("DireccionEmisor > 100 → error nombrando el campo y el límite (caso real v321)", () => {
    const err = () => buildEcfXml(baseInput({ emisor: { rnc: "130123456", razonSocial: "X SRL", direccion: "y".repeat(121) } }));
    expect(err).toThrow(/DireccionEmisor.*100/);
  });

  it("RazonSocialEmisor > 150 y NombreItem > 80 → errores específicos", () => {
    expect(() => buildEcfXml(baseInput({ emisor: { rnc: "130123456", razonSocial: "z".repeat(151), direccion: "Calle 1" } }))).toThrow(/RazonSocialEmisor.*150/);
    expect(() =>
      buildEcfXml(baseInput({ items: [{ nombre: "n".repeat(81), cantidad: 1, precioUnitario: 100, itbisRate: 18 }] })),
    ).toThrow(/Item #1.*NombreItem.*80/);
  });
});

// ── RI: código de seguridad + URLs del QR (Informe Técnico §18) ──────────────

describe("v335 — fundación de Representación Impresa", () => {
  const signedXml =
    '<?xml version="1.0"?><ECF><Encabezado/><Signature><SignatureValue>cZVCxnAbCdEf0123\n  456789==</SignatureValue></Signature></ECF>';

  it("extrae SignatureValue (sin espacios) y deriva el código de seguridad (6 chars)", () => {
    expect(extractSignatureValue(signedXml)).toBe("cZVCxnAbCdEf0123456789==");
    expect(securityCodeFromSignedXml(signedXml)).toBe("cZVCxn"); // como el ejemplo oficial de CerteCF
  });

  it("XML sin firma → error claro", () => {
    expect(() => securityCodeFromSignedXml("<ECF></ECF>")).toThrow(/SignatureValue/);
  });

  it("URL oficial ConsultaTimbre con los 7 parámetros en orden", () => {
    const url = buildConsultaTimbreUrl("CerteCF", {
      rncEmisor: "132596161",
      rncComprador: null,
      eNcf: "E340000000049",
      fechaEmision: "15-10-2025",
      montoTotal: "10000",
      fechaFirma: "15-10-2025 15:13:41",
      codigoSeguridad: "cZVCxn",
    });
    expect(url.startsWith("https://ecf.dgii.gov.do/CerteCF/ConsultaTimbre?")).toBe(true);
    expect(url).toContain("RncEmisor=132596161");
    expect(url).toContain("ENCF=E340000000049");
    expect(url).toContain("CodigoSeguridad=cZVCxn");
  });

  it("URL ConsultaTimbreFC (FC<250k) usa fc.dgii.gov.do con 4 parámetros", () => {
    const url = buildConsultaTimbreFcUrl("TesteCF", { rncEmisor: "1", eNcf: "E320000000001", montoTotal: "100.00", codigoSeguridad: "abc123" });
    expect(url.startsWith("https://fc.dgii.gov.do/TesteCF/ConsultaTimbreFC?")).toBe(true);
    expect(url).not.toContain("RncComprador"); // el formato FC no lo lleva
  });

  it("geometría oficial del QR documentada (versión 8, 22mm, margen 3mm)", () => {
    expect(DGII_QR_SPEC.version).toBe(8);
    expect(DGII_QR_SPEC.minSizeMm).toBe(22);
    expect(DGII_QR_SPEC.marginMm).toBe(3);
  });
});

// ── Endpoints documentales + invariantes ─────────────────────────────────────

describe("v335 — endpoints oficiales documentados e invariantes", () => {
  it("paths de aprobación comercial y anulación de rangos + host RFCE", () => {
    expect(DGII_PATHS.aprobacionComercial).toBe("aprobacioncomercial/api/aprobacioncomercial");
    expect(DGII_PATHS.anulacionRangos).toBe("anulacionrangos/api/operaciones/anularrango");
    expect(DGII_FC_BASE_URLS.testecf).toBe("https://fc.dgii.gov.do/testecf/");
    expect(DGII_RECEPCION_FC_PATH).toBe("recepcionfc/api/recepcion/ecf");
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/invoice-prepare.ts.
  it.skip("invoice-prepare: sin placeholders del emisor, idempotencia en tx, xsdErrors propagados, compensación storage", () => {
    const src = readSrc("src/lib/dgii/invoice-prepare.ts");
    expect(src).not.toMatch(/\?\? "130000000"|\?\? "Emisor"|\?\? "N\/A"/); // P3-3: cero fallbacks inventados
    expect(src).toMatch(/FOR UPDATE/); // P2-1: lock de la venta dentro de la tx
    expect(src).toMatch(/range_start: \{ lte: eNcfNum \}/); // P2-2: secuencia por rango que contiene el eNCF
    expect(src).toMatch(/xsdErrors/); // P3-1: errores XSD visibles
    expect(src).toMatch(/deleteDgiiObjectBestEffort/); // P2 bug-hunt: anti-huérfanos
  });

  it("print-representation es PURO y sin segundo firmador", () => {
    const src = readSrc("src/lib/dgii/print-representation.ts");
    expect(src).not.toMatch(/fetch\(|prisma|crypto\.createSign|new SignedXml/);
    expect(src).toMatch(/CONFIRMAR en TestECF/i); // interpretación del código marcada honesta
  });
});
