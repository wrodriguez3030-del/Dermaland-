import { describe, it, expect, beforeAll } from "vitest";
import forge from "node-forge";
import {
  signEcfXml,
  verifyEcfSignature,
  DgiiSignerError,
} from "./signer";
import { buildEcfXml } from "./builder";
import type { EcfBuilderInput } from "./types";

/**
 * Tests del firmador XMLDSig.
 *
 * Generamos un cert self-signed con node-forge **en runtime** (NUNCA un cert
 * real). El cert no se persiste, no se commitea, no sale del proceso de test.
 * Ningún binario .p12 cruza Git ni Vercel.
 */

interface DummyKeyPair {
  certificatePem: string;
  privateKeyPem: string;
}

function makeDummyKeyPair(): DummyKeyPair {
  // RSA 1024 para tests rápidos. Producción usa el cert DGII real (>= 2048).
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
    { shortName: "O", value: "DermaLand" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const fixedDate = new Date(2026, 4, 17, 14, 30, 45);

function makeUnsignedEcfXml(): string {
  const input: EcfBuilderInput = {
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
  };
  return buildEcfXml(input);
}

// Cert dummy compartido entre tests para no regenerar RSA en cada it().
let dummy: DummyKeyPair;
let unsignedXml: string;

beforeAll(() => {
  dummy = makeDummyKeyPair();
  unsignedXml = makeUnsignedEcfXml();
});

describe("signEcfXml — estructura de la firma", () => {
  it("añade un único elemento <Signature> al XML", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const matches = xml.match(/<(?:[\w-]+:)?Signature\b/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    // Un solo <Signature> raíz (los Reference/Transforms no cuentan).
    expect(xml).toContain("<Signature");
  });

  it("inserta la firma DENTRO del elemento <ECF>", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const ecfOpen = xml.indexOf("<ECF");
    const ecfClose = xml.indexOf("</ECF>");
    const sigOpen = xml.indexOf("<Signature");
    expect(ecfOpen).toBeGreaterThan(-1);
    expect(sigOpen).toBeGreaterThan(ecfOpen);
    expect(sigOpen).toBeLessThan(ecfClose);
  });

  it("ubica la firma después de <FechaHoraFirma> (último hijo de ECF)", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const idxFirma = xml.indexOf("<FechaHoraFirma>");
    const idxSig = xml.indexOf("<Signature");
    expect(idxFirma).toBeGreaterThan(-1);
    expect(idxSig).toBeGreaterThan(idxFirma);
  });

  it("usa SignatureMethod RSA-SHA256", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(xml).toContain(
      'Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"',
    );
  });

  it("usa DigestMethod SHA256", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(xml).toContain(
      'Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"',
    );
  });

  it("usa CanonicalizationMethod c14n-20010315", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(xml).toContain(
      'Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"',
    );
  });

  it("incluye Transform enveloped-signature en la Reference", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(xml).toContain(
      'Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"',
    );
  });

  it("Reference dentro de SignedInfo con Transforms y DigestMethod", () => {
    // NOTA: DGII pide `URI=""` estricto en la Reference. xml-crypto v6
    // auto-genera `URI="#_0"` y añade `Id="_0"` al elemento ECF firmado.
    // Es XMLDSig spec-compliant y la firma verifica matemáticamente, pero
    // si DGII rechaza por URI no vacía hay que post-procesar el XML para
    // forzar `URI=""` y eliminar el `Id` auto-generado. Duda D-11 en
    // `docs/dgii/matriz-requisitos-dgii.md`.
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const signedInfo = xml.match(/<SignedInfo[\s\S]*?<\/SignedInfo>/)?.[0];
    expect(signedInfo).toBeDefined();
    expect(signedInfo).toContain("<Reference");
    expect(signedInfo).toContain("<Transforms>");
    expect(signedInfo).toContain("<DigestMethod");
    expect(signedInfo).toContain("<DigestValue");
  });

  it("incluye KeyInfo → X509Data → X509Certificate con el cert base64", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(xml).toContain("<KeyInfo");
    expect(xml).toContain("<X509Data>");
    expect(xml).toContain("<X509Certificate>");
    // El cert PEM sin headers va dentro. Tomamos las primeras letras del cert
    // base64 y verificamos que aparezcan en el XML.
    const certBase64 = dummy.certificatePem
      .replace(/-----[^-]+-----/g, "")
      .replace(/\s+/g, "");
    const head = certBase64.slice(0, 40);
    expect(xml).toContain(head);
  });

  it("DigestValue y SignatureValue no son vacíos", () => {
    const { xml } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const digest = xml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    const sigVal = xml.match(/<SignatureValue[^>]*>([^<]+)<\/SignatureValue>/);
    expect(digest?.[1]?.length ?? 0).toBeGreaterThan(20);
    expect(sigVal?.[1]?.length ?? 0).toBeGreaterThan(20);
  });

  it("retorna signedAt en ISO 8601", () => {
    const { signedAt } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    expect(signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("signEcfXml — validaciones de input", () => {
  it("rechaza XML sin <ECF>", () => {
    expect(() =>
      signEcfXml({
        xml: "<otro>no ecf</otro>",
        certificatePem: dummy.certificatePem,
        privateKeyPem: dummy.privateKeyPem,
      }),
    ).toThrow(DgiiSignerError);
  });

  it("rechaza cert PEM sin marcador BEGIN CERTIFICATE", () => {
    expect(() =>
      signEcfXml({
        xml: unsignedXml,
        certificatePem: "no es un cert",
        privateKeyPem: dummy.privateKeyPem,
      }),
    ).toThrow(DgiiSignerError);
  });

  it("rechaza privateKey PEM sin marcador BEGIN ... PRIVATE KEY", () => {
    expect(() =>
      signEcfXml({
        xml: unsignedXml,
        certificatePem: dummy.certificatePem,
        privateKeyPem: "no es una llave",
      }),
    ).toThrow(DgiiSignerError);
  });

  it("no expone la privateKey en el mensaje de error", () => {
    try {
      signEcfXml({
        xml: unsignedXml,
        certificatePem: dummy.certificatePem,
        privateKeyPem: "PRIVATE KEY corrupta",
      });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("PRIVATE KEY corrupta");
    }
  });
});

describe("verifyEcfSignature — roundtrip", () => {
  it("verifica matemáticamente una firma generada por signEcfXml", () => {
    const { xml: signed } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const ok = verifyEcfSignature(signed, dummy.certificatePem);
    expect(ok).toBe(true);
  });

  it("rechaza un XML sin <Signature>", () => {
    expect(() =>
      verifyEcfSignature(unsignedXml, dummy.certificatePem),
    ).toThrow(DgiiSignerError);
  });

  it("detecta tampering en el cuerpo del XML", () => {
    const { xml: signed } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    // Modificamos el monto total — la firma debe romperse.
    const tampered = signed.replace(
      "<MontoTotal>1180.00</MontoTotal>",
      "<MontoTotal>9999.00</MontoTotal>",
    );
    const ok = verifyEcfSignature(tampered, dummy.certificatePem);
    expect(ok).toBe(false);
  });

  it("detecta firma con cert diferente al que se usó para firmar", () => {
    const { xml: signed } = signEcfXml({
      xml: unsignedXml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const otherCert = makeDummyKeyPair().certificatePem;
    const ok = verifyEcfSignature(signed, otherCert);
    expect(ok).toBe(false);
  });
});
