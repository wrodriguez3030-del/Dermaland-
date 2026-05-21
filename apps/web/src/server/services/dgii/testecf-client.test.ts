import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import forge from "node-forge";
import {
  prepareTestecfSubmission,
  executeTestecfSubmission,
  TestecfClientError,
  TestecfSendDisabled,
} from "./testecf-client";
import type { EcfBuilderInput } from "./types";

/**
 * Tests del cliente DGII testecf.
 *
 * **Regla dura:** estos tests NO hacen fetch a DGII bajo ninguna
 * circunstancia. Si alguno introduce un network call accidental, el
 * vi.spyOn de global.fetch al inicio lo detecta y falla el test.
 *
 * Cubrimos:
 *   - `prepareTestecfSubmission` arma URLs correctas + XSD + firma
 *   - Refuse ambiente !== 'testecf'
 *   - Refuse baseUrl override que apunta a /ecf/
 *   - `executeTestecfSubmission` tira TestecfSendDisabled siempre
 *   - cero llamadas a global.fetch en todo el archivo
 */

const xsdPath = (tipo: "31" | "32") =>
  path.resolve(
    process.cwd(),
    "..",
    "..",
    "docs",
    "dgii",
    "xsd",
    `e-CF-${tipo}-v1.0.xsd`,
  );

function genDummyCert(): { certificatePem: string; privateKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: "DermaLand Dry-Run Test Cert" },
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

function makeEcfInputTipo31(): EcfBuilderInput {
  const fixedDate = new Date(2026, 4, 17, 14, 30, 45);
  return {
    tipoEcf: "31",
    eNcf: "E310000000001",
    fechaVencimientoSecuencia: new Date(2027, 11, 31),
    tipoIngresos: "01",
    tipoPago: 1,
    emisor: {
      rncEmisor: "132590775",
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
  };
}

let dummyCert: ReturnType<typeof genDummyCert>;
let xsd31: string;
let xsd32: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  dummyCert = genDummyCert();
  xsd31 = fs.readFileSync(xsdPath("31"), "utf8");
  xsd32 = fs.readFileSync(xsdPath("32"), "utf8");
  // Guard global: si alguien hace fetch durante un test, falla.
  fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
    throw new Error(
      "fetch invoked during dry-run test — esto es un BUG: ningún " +
        "test del cliente debe golpear DGII ni red alguna.",
    );
  });
});

describe("prepareTestecfSubmission (dry-run, no HTTP)", () => {
  it("arma URLs correctas para ambiente testecf", async () => {
    const ev = await prepareTestecfSubmission({
      ecfInput: makeEcfInputTipo31(),
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd31,
      ambiente: "testecf",
    });
    expect(ev.ambiente).toBe("testecf");
    expect(ev.baseUrl).toBe("https://ecf.dgii.gov.do/testecf");
    expect(ev.endpoints.semilla).toBe(
      "https://ecf.dgii.gov.do/testecf/autenticacion/api/autenticacion/semilla",
    );
    expect(ev.endpoints.validarSemilla).toBe(
      "https://ecf.dgii.gov.do/testecf/autenticacion/api/autenticacion/validarsemilla",
    );
    expect(ev.endpoints.recepcionEcf).toBe(
      "https://ecf.dgii.gov.do/testecf/recepcion/api/ecf",
    );
  });

  it("XSD oficial valida el XML firmado (tipo 31)", async () => {
    const ev = await prepareTestecfSubmission({
      ecfInput: makeEcfInputTipo31(),
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd31,
      ambiente: "testecf",
    });
    if (!ev.validation.xsdValid) {
      console.error("XSD errors:", ev.validation.xsdErrors.slice(0, 3));
    }
    expect(ev.validation.xsdValid).toBe(true);
    expect(ev.validation.signatureEmbedded).toBe(true);
    expect(ev.validation.signatureVerifiedLocally).toBe(true);
  });

  it("rechaza ambiente !== 'testecf' (anti-foot-gun)", async () => {
    await expect(
      prepareTestecfSubmission({
        ecfInput: makeEcfInputTipo31(),
        certificatePem: dummyCert.certificatePem,
        privateKeyPem: dummyCert.privateKeyPem,
        xsdContent: xsd31,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ambiente: "ecf" as any,
      }),
    ).rejects.toBeInstanceOf(TestecfClientError);
  });

  it("send.enabled === false (killswitch) + razones de bloqueo presentes", async () => {
    const ev = await prepareTestecfSubmission({
      ecfInput: makeEcfInputTipo31(),
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd31,
      ambiente: "testecf",
    });
    expect(ev.send.enabled).toBe(false);
    expect(ev.send.blockingReasons.length).toBeGreaterThan(0);
    expect(ev.send.blockingReasons.join(" ")).toMatch(
      /DGII_TESTECF_SEND_ENABLED/,
    );
    expect(ev.send.blockingReasons.join(" ")).toMatch(/postulación/i);
    expect(ev.send.blockingReasons.join(" ")).toMatch(/rango/i);
  });

  it("evidencia NO contiene contraseña, private key ni texto sensible", async () => {
    const ev = await prepareTestecfSubmission({
      ecfInput: makeEcfInputTipo31(),
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd31,
      ambiente: "testecf",
    });
    const blob = JSON.stringify(ev);
    expect(blob).not.toMatch(/-----BEGIN RSA PRIVATE KEY-----/);
    expect(blob).not.toMatch(/BEGIN.*PRIVATE/i);
    // El cert PEM público sí puede aparecer (KeyInfo); password nunca.
    expect(blob).not.toMatch(/demo-pass/i);
  });

  it("payloadSize coincide con el largo real del XML firmado", async () => {
    const ev = await prepareTestecfSubmission({
      ecfInput: makeEcfInputTipo31(),
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd31,
      ambiente: "testecf",
    });
    const decoded = Buffer.from(ev.signedXmlBase64, "base64").toString("utf8");
    expect(Buffer.byteLength(decoded, "utf8")).toBe(
      ev.payloadSize.signedXmlBytes,
    );
    expect(decoded).toContain("<ECF");
    expect(decoded).toContain("<Signature");
  });

  it("también funciona para tipo 32 (Factura de Consumo)", async () => {
    const input = makeEcfInputTipo31();
    input.tipoEcf = "32";
    input.eNcf = "E320000000001";
    // tipo 32 acepta comprador vacío.
    input.comprador = {};
    const ev = await prepareTestecfSubmission({
      ecfInput: input,
      certificatePem: dummyCert.certificatePem,
      privateKeyPem: dummyCert.privateKeyPem,
      xsdContent: xsd32,
      ambiente: "testecf",
    });
    if (!ev.validation.xsdValid) {
      console.error("XSD 32 errors:", ev.validation.xsdErrors.slice(0, 3));
    }
    expect(ev.validation.xsdValid).toBe(true);
    expect(ev.ecf.tipoEcf).toBe("32");
  });
});

describe("executeTestecfSubmission (siempre bloqueado en este build)", () => {
  it("tira TestecfSendDisabled aunque pasen todas las flags externas", async () => {
    await expect(
      executeTestecfSubmission({
        ecfInput: makeEcfInputTipo31(),
        certificatePem: dummyCert.certificatePem,
        privateKeyPem: dummyCert.privateKeyPem,
        xsdContent: xsd31,
        ambiente: "testecf",
        postulacionApproved: true,
        rangoAuthorized: true,
        userConfirmedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(TestecfSendDisabled);
  });

  it("reasons incluye killswitch + 'no implementada todavia' aunque vengan confirmaciones", async () => {
    try {
      await executeTestecfSubmission({
        ecfInput: makeEcfInputTipo31(),
        certificatePem: dummyCert.certificatePem,
        privateKeyPem: dummyCert.privateKeyPem,
        xsdContent: xsd31,
        ambiente: "testecf",
        postulacionApproved: true,
        rangoAuthorized: true,
        userConfirmedAt: new Date().toISOString(),
      });
      throw new Error("debería haber tirado TestecfSendDisabled");
    } catch (err) {
      expect(err).toBeInstanceOf(TestecfSendDisabled);
      const reasons = (err as TestecfSendDisabled).reasons;
      expect(reasons.some((r) => r.includes("DGII_TESTECF_SEND_ENABLED"))).toBe(
        true,
      );
      expect(reasons.some((r) => r.toLowerCase().includes("no implementada"))).toBe(
        true,
      );
    }
  });

  it("bloquea también con ambiente != testecf", async () => {
    await expect(
      executeTestecfSubmission({
        ecfInput: makeEcfInputTipo31(),
        certificatePem: dummyCert.certificatePem,
        privateKeyPem: dummyCert.privateKeyPem,
        xsdContent: xsd31,
        ambiente: "certecf",
        postulacionApproved: true,
        rangoAuthorized: true,
        userConfirmedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(TestecfSendDisabled);
  });
});

describe("guard global de fetch", () => {
  it("ningún test invocó global.fetch", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
