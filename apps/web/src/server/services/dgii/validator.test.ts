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
const XSD_PATH = path.resolve(
  process.cwd(),
  "../..",
  "docs",
  "dgii",
  "xsd",
  "e-CF-31-v1.0.xsd",
);

let XSD: string;
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
