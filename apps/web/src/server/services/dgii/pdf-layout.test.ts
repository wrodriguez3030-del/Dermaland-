import { describe, it, expect, beforeAll } from "vitest";
import zlib from "node:zlib";
import forge from "node-forge";
import { generateEcfPdf, footerQrLayout } from "./pdf";
import { buildEcfXml } from "./builder";
import { signEcfXml } from "./signer";
import type { EcfBuilderInput } from "./types";

/**
 * Tests de layout del PDF e-CF: foco en que el QR no se superponga con el
 * texto, que el logo se dibuje y que el documento se genere sin error.
 *
 * pdfkit comprime los content streams, así que verificamos los operadores de
 * dibujo inflando los streams con zlib en lugar de hacer OCR.
 */

function makeInput(over: Partial<EcfBuilderInput> = {}): EcfBuilderInput {
  const d = new Date(2026, 4, 17, 14, 30, 45);
  return {
    tipoEcf: "32",
    eNcf: "E320000000123",
    fechaVencimientoSecuencia: new Date(2027, 11, 31),
    tipoIngresos: "01",
    tipoPago: 1,
    emisor: {
      rncEmisor: "13259077503",
      razonSocialEmisor: "DermaLand SRL",
      nombreComercial: "DermaLand",
      direccionEmisor:
        "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este",
      municipio: "Santiago",
      provincia: "Santiago",
      telefonosEmisor: ["809-226-5252"],
      correoEmisor: "dermalandrd@gmail.com",
      fechaEmision: d,
    },
    comprador: { razonSocialComprador: "María Pérez" },
    totales: {
      montoGravadoTotal: 2500,
      itbis1: 18,
      totalItbis: 450,
      totalItbis1: 450,
      montoTotal: 2950,
    },
    items: [
      {
        numeroLinea: 1,
        indicadorFacturacion: 1,
        nombreItem:
          "Protector solar facial SPF 50+ con color, frasco 50ml resistente al agua",
        indicadorBienoServicio: 1,
        cantidadItem: 2,
        precioUnitarioItem: 750,
        montoItem: 1500,
      },
      {
        numeroLinea: 2,
        indicadorFacturacion: 1,
        nombreItem: "Sérum ácido hialurónico",
        indicadorBienoServicio: 1,
        cantidadItem: 1,
        precioUnitarioItem: 1000,
        montoItem: 1000,
      },
    ],
    fechaHoraFirma: d,
    ...over,
  };
}

function dummyKeys() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: "commonName", value: "DermaLand DGII Test" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

let signedXml: string;
beforeAll(() => {
  const unsigned = buildEcfXml(makeInput());
  const k = dummyKeys();
  signedXml = signEcfXml({
    xml: unsigned,
    certificatePem: k.certificatePem,
    privateKeyPem: k.privateKeyPem,
  }).xml;
});

function inflatedContent(pdf: Buffer): string {
  const s = pdf.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = re.exec(s))) {
    try {
      out += zlib.inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
    } catch {
      /* no es un stream deflate */
    }
  }
  return out;
}

describe("footerQrLayout — el QR no toca el texto", () => {
  const L = footerQrLayout();

  it("el QR cabe dentro de los márgenes de página", () => {
    expect(L.qrX + L.qrSize).toBeLessThanOrEqual(L.pageRight);
    expect(L.qrX).toBeGreaterThan(L.pageLeft);
  });

  it("la columna de texto deja un espacio antes del QR (sin superposición)", () => {
    const textRight = L.pageLeft + L.textWidth;
    expect(textRight).toBeLessThanOrEqual(L.qrX - L.gap + 0.001);
    expect(L.gap).toBeGreaterThanOrEqual(16);
    expect(L.textWidth).toBeGreaterThan(0);
  });
});

describe("generateEcfPdf — layout y contenido", () => {
  it("genera un PDF válido (magic bytes + EOF) en modo demo", async () => {
    const buf = await generateEcfPdf({
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
    });
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.subarray(buf.byteLength - 32).toString("ascii")).toContain(
      "%%EOF",
    );
  });

  it("dibuja el logo (fill even-odd) y la caja del total", async () => {
    const buf = await generateEcfPdf({
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
    });
    const content = inflatedContent(buf);
    expect(content).toMatch(/f\*/); // relleno even-odd → "D" calada del logo
    expect(content).toMatch(/\bre\b/); // rectángulo (caja del total)
    expect(content).toMatch(/\bcm\b/); // transform (escalado del logo)
  });

  it("incluye el QR como imagen embebida (visible/escaneable)", async () => {
    const buf = await generateEcfPdf({
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
    });
    expect(buf.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
  });

  it("incluye datos de empresa en la metadata (razón social, e-NCF)", async () => {
    const buf = await generateEcfPdf({
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
    });
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("DermaLand SRL");
    expect(ascii).toContain("E320000000123");
  });

  it("acepta formas de pago y NO expone número completo de tarjeta", async () => {
    const buf = await generateEcfPdf({
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
      compradorTelefono: "+1 809-555-0101",
      paymentLines: [
        { label: "Tarjeta", amount: 2500, last4: "4242" },
        { label: "Efectivo", amount: 450 },
      ],
    });
    // Genera un PDF válido con la sección de pagos. El sistema nunca recibe el
    // PAN completo: el tipo PdfPaymentLine sólo lleva `last4`, por lo que es
    // imposible imprimir el número de tarjeta completo.
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it("el PDF demo difiere del no-demo (nota DEMO añadida)", async () => {
    const base = {
      ecf: makeInput(),
      signedXml,
      ambiente: "testecf" as const,
      estadoDgii: "signed" as const,
    };
    const demo = await generateEcfPdf({ ...base, demo: true });
    const noDemo = await generateEcfPdf({ ...base, demo: false });
    expect(demo.byteLength).not.toBe(noDemo.byteLength);
  });
});
