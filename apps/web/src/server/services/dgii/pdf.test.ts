import { describe, it, expect, beforeAll } from "vitest";
import forge from "node-forge";
import { generateEcfPdf, DgiiPdfError } from "./pdf";
import { buildEcfXml } from "./builder";
import { signEcfXml } from "./signer";
import type { EcfBuilderInput } from "./types";

/**
 * Tests del generador de PDF.
 *
 * Validamos:
 *  - El Buffer resultante es un PDF real (magic bytes "%PDF-").
 *  - El PDF contiene fragmentos esperados (e-NCF, RNC del emisor) cuando se
 *    inspecciona como bytes.
 *  - El PDF no expone passwords/claves.
 *  - Falla limpiamente si el XML firmado no tiene SignatureValue.
 *
 * NO renderizamos el PDF a imagen ni hacemos OCR — se confía en pdfkit y los
 * test verifican estructura básica.
 */

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
      nombreComercial: "DermaLand",
      direccionEmisor: "Calle E. León Jiménez No. 47, Santiago",
      municipio: "Santiago",
      provincia: "Santiago",
      correoEmisor: "fiscal@dermaland.do",
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

let signedXml: string;
let unsignedXml: string;
let DUMMY_PASSWORD = "topsecret123-not-in-pdf";

beforeAll(() => {
  unsignedXml = buildEcfXml(makeValidInput());
  const dummy = makeDummyKeyPair();
  const result = signEcfXml({
    xml: unsignedXml,
    certificatePem: dummy.certificatePem,
    privateKeyPem: dummy.privateKeyPem,
  });
  signedXml = result.xml;
});

describe("generateEcfPdf — estructura básica", () => {
  it("retorna un Buffer no vacío con magic bytes %PDF-", async () => {
    const buf = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    expect(buf.byteLength).toBeGreaterThan(500);
    const head = buf.subarray(0, 5).toString("ascii");
    expect(head).toBe("%PDF-");
  });

  it("PDF termina con %%EOF (marca de fin del PDF)", async () => {
    const buf = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    const tail = buf.subarray(buf.byteLength - 32).toString("ascii");
    expect(tail).toContain("%%EOF");
  });

  it("incluye e-NCF y RNC en metadata del PDF (Title/Author)", async () => {
    const buf = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    const ascii = buf.toString("latin1");
    // Title incluye e-NCF, Author incluye razón social.
    expect(ascii).toContain("E310000000001");
    expect(ascii).toContain("DermaLand SRL");
  });

  it("incluye TrackId cuando se provee (smoke: PDF distinto cuando hay trackId)", async () => {
    // pdfkit comprime los content streams por defecto, así que el texto
    // renderizado NO aparece como ASCII en el buffer. Verificamos en su
    // lugar que el PDF se genera sin error y que el tamaño cambia cuando
    // se añade el campo trackId.
    const withTrack = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "submitted",
      trackId: "DGII-TRK-2026-9999",
    });
    const withoutTrack = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "submitted",
    });
    expect(withTrack.byteLength).toBeGreaterThan(500);
    expect(withoutTrack.byteLength).toBeGreaterThan(500);
    expect(withTrack.byteLength).not.toBe(withoutTrack.byteLength);
  });
});

describe("generateEcfPdf — seguridad", () => {
  it("NO expone el contenido completo del XML firmado", async () => {
    const buf = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    const ascii = buf.toString("latin1");
    // El PDF no debe incluir el XML firmado completo (sería redundante y
    // expone metadatos crypto innecesariamente).
    expect(ascii).not.toContain("<SignatureValue>");
    expect(ascii).not.toContain("<Signature ");
  });

  it("NO expone passwords ni datos crypto sensibles", async () => {
    // El PDF se genera solo con cert público + XML firmado, sin password.
    // Por defensa, el test verifica que ningún password ficticio se filtre.
    const buf = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    const ascii = buf.toString("latin1");
    expect(ascii).not.toContain(DUMMY_PASSWORD);
  });
});

describe("generateEcfPdf — casos", () => {
  it("acepta e-CF 32 con consumidor final (sin RNCComprador)", async () => {
    const buf = await generateEcfPdf({
      ecf: makeValidInput({
        tipoEcf: "32",
        comprador: { razonSocialComprador: "Consumidor Final" },
      }),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    expect(buf.byteLength).toBeGreaterThan(500);
    const head = buf.subarray(0, 5).toString("ascii");
    expect(head).toBe("%PDF-");
  });

  it("falla si el XML no contiene SignatureValue", async () => {
    await expect(
      generateEcfPdf({
        ecf: makeValidInput(),
        signedXml: unsignedXml, // sin firma
        ambiente: "testecf",
        estadoDgii: "accepted",
      }),
    ).rejects.toThrow(DgiiPdfError);
  });

  it("genera PDFs distintos para inputs distintos (smoke)", async () => {
    const buf1 = await generateEcfPdf({
      ecf: makeValidInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    const buf2 = await generateEcfPdf({
      ecf: makeValidInput({ eNcf: "E310000000002" }),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "accepted",
    });
    expect(buf1.byteLength).toBeGreaterThan(0);
    expect(buf2.byteLength).toBeGreaterThan(0);
    // El contenido binario varía (al menos por el eNCF en metadata).
    expect(buf1.toString("latin1")).not.toBe(buf2.toString("latin1"));
  });
});
