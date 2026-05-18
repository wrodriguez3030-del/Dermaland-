import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { validateEcfXml, DgiiValidatorError } from "./validator";
import { buildEcfXml } from "./builder";
import { signEcfXml } from "./signer";
import type { EcfBuilderInput } from "./types";

/**
 * Tests del validador XSD.
 *
 * El XSD oficial vive en `docs/dgii/xsd/e-CF-31-v1.0.xsd` (repo-relative).
 * El test lo lee desde disco. Para uso en producción (Vercel function), el
 * caller debe leer el XSD desde un asset bundleado o embedido en el código.
 *
 * Nota clave: el XSD termina con `<xs:any minOccurs="1" maxOccurs="1"/>`
 * que exige EXACTAMENTE un elemento adicional después de FechaHoraFirma.
 * Ese slot lo ocupa la `<Signature>` XMLDSig. Por eso los tests "válidos"
 * usan el flujo completo `buildEcfXml → signEcfXml → validateEcfXml`.
 */

// process.cwd() durante `pnpm --filter web test` apunta a apps/web.
const xsdPath = (tipo: "31" | "32" | "33" | "34") =>
  path.resolve(
    process.cwd(),
    "../..",
    "docs",
    "dgii",
    "xsd",
    `e-CF-${tipo}-v1.0.xsd`,
  );

const XSD_PATH = xsdPath("31");

let XSD: string;
let XSD_BY_TYPE: Record<"31" | "32" | "33" | "34", string>;
let dummyCertPem: string;
let dummyPrivateKeyPem: string;

const fixedDate = new Date(2026, 4, 17, 14, 30, 45);

function makeValidInput(
  overrides: Partial<EcfBuilderInput> = {},
): EcfBuilderInput {
  return {
    tipoEcf: "31",
    eNcf: "E310000000001",
    fechaVencimientoSecuencia: new Date(2027, 11, 31),
    tipoIngresos: "01",
    tipoPago: 1,
    emisor: {
      rncEmisor: "13259077503",
      razonSocialEmisor: "DermaLand SRL",
      direccionEmisor: "Calle E. León Jiménez No. 47, Santiago",
      fechaEmision: fixedDate,
    },
    comprador: {
      rncComprador: "131234567",
      razonSocialComprador: "Distrimedica SRL",
    },
    totales: {
      montoGravadoTotal: 1000,
      itbis1: 18,
      totalItbis: 180,
      totalItbis1: 180,
      montoTotal: 1180,
    },
    items: [
      {
        numeroLinea: 1,
        indicadorFacturacion: 1,
        nombreItem: "Crema hidratante 50ml",
        indicadorBienoServicio: 1,
        cantidadItem: 2,
        precioUnitarioItem: 500,
        montoItem: 1000,
      },
    ],
    fechaHoraFirma: fixedDate,
    ...overrides,
  };
}

function makeDummyKeyPair() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: "DermaLand DGII Test" },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

beforeAll(() => {
  XSD = fs.readFileSync(XSD_PATH, "utf8");
  XSD_BY_TYPE = {
    "31": fs.readFileSync(xsdPath("31"), "utf8"),
    "32": fs.readFileSync(xsdPath("32"), "utf8"),
    "33": fs.readFileSync(xsdPath("33"), "utf8"),
    "34": fs.readFileSync(xsdPath("34"), "utf8"),
  };
  const dummy = makeDummyKeyPair();
  dummyCertPem = dummy.certificatePem;
  dummyPrivateKeyPem = dummy.privateKeyPem;
});

describe("validateEcfXml — XSD oficial e-CF 31", () => {
  it("XSD se lee correctamente desde docs/dgii/xsd", () => {
    expect(XSD.length).toBeGreaterThan(1000);
    expect(XSD).toContain("xs:schema");
    expect(XSD).toContain('name="ECF"');
  });

  it("XML firmado del builder valida contra XSD oficial", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    const result = await validateEcfXml({ xml: signed, xsd: XSD });
    if (!result.valid) {
      // Imprime errores cuando el test falla para diagnóstico.
      console.error("Errores XSD:", result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("XML sin firmar falla validación (xs:any minOccurs=1 al final)", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const result = await validateEcfXml({ xml: unsigned, xsd: XSD });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("XML completamente vacío falla con error claro", async () => {
    const result = await validateEcfXml({
      xml: '<?xml version="1.0"?><ECF></ECF>',
      xsd: XSD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Error debe mencionar contenido faltante.
    const msgs = result.errors.map((e) => e.message).join(" | ");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("XML mal formado a nivel sintáctico falla", async () => {
    const result = await validateEcfXml({
      xml: '<?xml version="1.0"?><ECF><no-cerrado>',
      xsd: XSD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateEcfXml — detección de defectos comunes", () => {
  it("falla si falta MontoTotal en Totales (campo obligatorio del XSD)", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    // Removemos MontoTotal — invalida la firma y la estructura.
    const tampered = signed.replace(
      /<MontoTotal>[^<]+<\/MontoTotal>/,
      "",
    );
    const result = await validateEcfXml({ xml: tampered, xsd: XSD });
    expect(result.valid).toBe(false);
  });

  it("falla si TipoeCF tiene valor fuera del enum (e.g. '99')", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    const tampered = signed.replace(
      /<TipoeCF>31<\/TipoeCF>/,
      "<TipoeCF>99</TipoeCF>",
    );
    const result = await validateEcfXml({ xml: tampered, xsd: XSD });
    expect(result.valid).toBe(false);
  });

  it("falla si eNCF no tiene 13 caracteres (pattern del XSD)", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    const tampered = signed.replace(
      /<eNCF>E310000000001<\/eNCF>/,
      "<eNCF>E310000</eNCF>",
    );
    const result = await validateEcfXml({ xml: tampered, xsd: XSD });
    expect(result.valid).toBe(false);
  });

  it("falla si RNCEmisor no es 9 u 11 dígitos", async () => {
    const unsigned = buildEcfXml(makeValidInput());
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    const tampered = signed.replace(
      /<RNCEmisor>13259077503<\/RNCEmisor>/,
      "<RNCEmisor>1234</RNCEmisor>",
    );
    const result = await validateEcfXml({ xml: tampered, xsd: XSD });
    expect(result.valid).toBe(false);
  });
});

describe("validateEcfXml — XSDs oficiales 32/33/34 (Fase L completa)", () => {
  const baseInfoRef = {
    ncfModificado: "E310000000100",
    rncOtroContribuyente: "131234567",
    fechaNCFModificado: new Date(2026, 3, 10),
    codigoModificacion: 3 as const,
  };

  async function buildSignAndValidate(
    overrides: Parameters<typeof makeValidInput>[0],
    tipo: "31" | "32" | "33" | "34",
  ) {
    const unsigned = buildEcfXml(makeValidInput(overrides));
    const { xml: signed } = signEcfXml({
      xml: unsigned,
      certificatePem: dummyCertPem,
      privateKeyPem: dummyPrivateKeyPem,
    });
    return validateEcfXml({ xml: signed, xsd: XSD_BY_TYPE[tipo] });
  }

  it("XSD 32 se carga sin errores (sin typo, con BOM)", () => {
    expect(XSD_BY_TYPE["32"].length).toBeGreaterThan(1000);
    expect(XSD_BY_TYPE["32"]).toContain('name="ECF"');
  });

  it("XSD 33 se carga sin errores", () => {
    expect(XSD_BY_TYPE["33"].length).toBeGreaterThan(1000);
    expect(XSD_BY_TYPE["33"]).toContain('name="ECF"');
  });

  it("XSD 34 se carga sin errores", () => {
    expect(XSD_BY_TYPE["34"].length).toBeGreaterThan(1000);
    expect(XSD_BY_TYPE["34"]).toContain('name="ECF"');
  });

  it("e-CF 32 con consumidor final (sin RNC) valida contra XSD 32 oficial", async () => {
    const result = await buildSignAndValidate(
      {
        tipoEcf: "32",
        eNcf: "E320000000001",
        comprador: { razonSocialComprador: "Consumidor Final" },
      },
      "32",
    );
    if (!result.valid) console.error("XSD 32 errores:", result.errors);
    expect(result.valid).toBe(true);
  });

  it("e-CF 32 con RNCComprador también valida contra XSD 32", async () => {
    const result = await buildSignAndValidate(
      { tipoEcf: "32", eNcf: "E320000000001" },
      "32",
    );
    if (!result.valid) console.error("XSD 32 errores:", result.errors);
    expect(result.valid).toBe(true);
  });

  it("e-CF 33 con informacionReferencia valida contra XSD 33 oficial", async () => {
    const result = await buildSignAndValidate(
      {
        tipoEcf: "33",
        eNcf: "E330000000001",
        informacionReferencia: baseInfoRef,
      },
      "33",
    );
    if (!result.valid) console.error("XSD 33 errores:", result.errors);
    expect(result.valid).toBe(true);
  });

  it("e-CF 34 con informacionReferencia + indicadorNotaCredito valida contra XSD 34", async () => {
    const result = await buildSignAndValidate(
      {
        tipoEcf: "34",
        eNcf: "E340000000001",
        indicadorNotaCredito: 0,
        informacionReferencia: { ...baseInfoRef, codigoModificacion: 1 },
      },
      "34",
    );
    if (!result.valid) console.error("XSD 34 errores:", result.errors);
    expect(result.valid).toBe(true);
  });

  it("e-CF 31 contra XSD 32 falla (validación de tipo cruzado)", async () => {
    const result = await buildSignAndValidate({ tipoEcf: "31" }, "32");
    expect(result.valid).toBe(false);
  });
});

describe("validateEcfXml — validación de input", () => {
  it("rechaza xml vacío", async () => {
    await expect(validateEcfXml({ xml: "", xsd: XSD })).rejects.toThrow(
      DgiiValidatorError,
    );
  });

  it("rechaza xsd vacío", async () => {
    await expect(
      validateEcfXml({ xml: "<x/>", xsd: "" }),
    ).rejects.toThrow(DgiiValidatorError);
  });

  it("rechaza xsd que no contiene xs:schema", async () => {
    await expect(
      validateEcfXml({ xml: "<x/>", xsd: "<not-xsd/>" }),
    ).rejects.toThrow(DgiiValidatorError);
  });
});
