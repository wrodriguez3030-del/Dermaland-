import "server-only";
import type { ElectronicInvoice } from "@/types";
import { buildEcfXml } from "./builder";
import { signEcfXml } from "./signer";
import {
  generateEcfPdf,
  type EstadoDgii,
  type GenerateEcfPdfInput,
} from "./pdf";
import { computeSecurityCode } from "./security-code";
import { buildDgiiConsultaUrl, type Ambiente } from "./qr";
import { getDgiiDemoKeyPair } from "./demo-cert";
import type {
  EcfBuilderInput,
  EcfItem,
  InformacionReferencia,
} from "./types";

/**
 * DEMOSTRACIÓN ÚNICAMENTE — Pipeline DGII completo a partir de un mock.
 *
 * Mapea una `ElectronicInvoice` mock (con solo totales) a un `EcfBuilderInput`
 * completo y ejecuta el pipeline offline:
 *   buildEcfXml → signEcfXml (cert dummy) → computeSecurityCode → buildDgiiConsultaUrl → generateEcfPdf
 *
 * Los datos del emisor se hardcodean a la información actual de DermaLand
 * SRL (mismo set que `/dgii/configuracion` UI). Los items se fabrican como
 * UNA línea agregada con `amount/itbis/total` del mock, ya que el mock no
 * almacena breakdown por item.
 *
 * El resultado se marca claramente como NO FISCAL: el `estadoDgii` se
 * preserva del mock para que la UI muestre el estado real registrado, pero
 * el PDF lleva una nota explicativa.
 */

/** Datos de emisor placeholder hasta que `dgii_settings` esté persistido. */
const DEMO_EMISOR = {
  rncEmisor: "13259077503",
  razonSocialEmisor: "DermaLand SRL",
  nombreComercial: "DermaLand",
  direccionEmisor:
    "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este",
  municipio: "Santiago",
  provincia: "Santiago",
  correoEmisor: "fiscal@dermaland.do",
} as const;

const DEMO_AMBIENTE: Ambiente = "testecf";

/** Tipos que el demo renderer puede mapear. */
const RENDERABLE_TYPES = new Set(["31", "32", "33", "34"]);

export class DgiiDemoRendererError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`DgiiDemoRenderer: ${message}`);
    this.name = "DgiiDemoRendererError";
    this.cause = cause;
  }
}

export interface DemoRenderResult {
  unsignedXml: string;
  signedXml: string;
  pdfBuffer: Buffer;
  securityCode: string;
  qrUrl: string;
  /** Marca de que este artefacto NO es fiscal. */
  warning: string;
}

/**
 * Mapea un mock `ElectronicInvoice` a un `EcfBuilderInput`. Hardcodea
 * emisor demo y fabrica un único item con los totales del mock.
 */
export function mapMockInvoiceToEcfInput(
  invoice: ElectronicInvoice,
): EcfBuilderInput {
  if (!RENDERABLE_TYPES.has(invoice.ecfType)) {
    throw new DgiiDemoRendererError(
      `Tipo e-CF ${invoice.ecfType} no soportado por el demo renderer (cubre 31-34).`,
    );
  }
  const fechaEmision = new Date(invoice.createdAt);

  const item: EcfItem = {
    numeroLinea: 1,
    indicadorFacturacion: invoice.amount > 0 ? 1 : 4,
    nombreItem: `Servicios/productos DermaLand (${invoice.ecfNumber})`,
    indicadorBienoServicio: 1,
    cantidadItem: 1,
    precioUnitarioItem: invoice.amount,
    montoItem: invoice.amount,
  };

  const comprador =
    invoice.ecfType === "32"
      ? {
          razonSocialComprador: invoice.customerName || "Consumidor Final",
        }
      : {
          rncComprador: "131234567", // placeholder — real flow lo trae del cliente
          razonSocialComprador: invoice.customerName,
        };

  let informacionReferencia: InformacionReferencia | undefined;
  if (invoice.ecfType === "33" || invoice.ecfType === "34") {
    informacionReferencia = {
      ncfModificado: "E310000000100",
      rncOtroContribuyente: "131234567",
      fechaNCFModificado: new Date(2026, 3, 10),
      codigoModificacion: invoice.ecfType === "34" ? 1 : 2,
    };
  }

  return {
    tipoEcf: invoice.ecfType,
    eNcf: invoice.ecfNumber,
    fechaVencimientoSecuencia: new Date(2027, 11, 31),
    tipoIngresos: "01",
    tipoPago: 1,
    emisor: {
      ...DEMO_EMISOR,
      fechaEmision,
    },
    comprador,
    totales: {
      montoGravadoTotal: invoice.amount,
      itbis1: 18,
      totalItbis: invoice.itbis,
      totalItbis1: invoice.itbis,
      montoTotal: invoice.total,
    },
    items: [item],
    informacionReferencia,
    fechaHoraFirma: fechaEmision,
  };
}

/**
 * Ejecuta el pipeline completo offline.
 */
export async function renderEcfFromMock(
  invoice: ElectronicInvoice,
): Promise<DemoRenderResult> {
  const ecfInput = mapMockInvoiceToEcfInput(invoice);

  let unsignedXml: string;
  try {
    unsignedXml = buildEcfXml(ecfInput);
  } catch (err) {
    throw new DgiiDemoRendererError(
      `falló buildEcfXml para ${invoice.ecfNumber}`,
      err,
    );
  }

  const { certificatePem, privateKeyPem } = getDgiiDemoKeyPair();

  let signedXml: string;
  try {
    signedXml = signEcfXml({
      xml: unsignedXml,
      certificatePem,
      privateKeyPem,
    }).xml;
  } catch (err) {
    throw new DgiiDemoRendererError(
      `falló signEcfXml para ${invoice.ecfNumber}`,
      err,
    );
  }

  let securityCode: string;
  try {
    securityCode = computeSecurityCode(signedXml);
  } catch (err) {
    throw new DgiiDemoRendererError(
      "falló computeSecurityCode",
      err,
    );
  }

  const qrUrl = buildDgiiConsultaUrl({
    ambiente: DEMO_AMBIENTE,
    rncEmisor: DEMO_EMISOR.rncEmisor,
    rncComprador: ecfInput.comprador.rncComprador,
    eNcf: ecfInput.eNcf,
    fechaEmision: ecfInput.emisor.fechaEmision,
    montoTotal: ecfInput.totales.montoTotal,
    codigoSeguridad: securityCode,
  });

  const pdfInput: GenerateEcfPdfInput = {
    ecf: ecfInput,
    signedXml,
    ambiente: DEMO_AMBIENTE,
    estadoDgii: invoice.status as EstadoDgii,
    trackId: invoice.trackId,
  };
  const pdfBuffer = await generateEcfPdf(pdfInput);

  return {
    unsignedXml,
    signedXml,
    pdfBuffer,
    securityCode,
    qrUrl,
    warning:
      "REPRESENTACIÓN DE DEMOSTRACIÓN. Firmado con un certificado dummy " +
      "generado en runtime. NO es un comprobante fiscal válido — no se " +
      "envió ni se enviará a DGII en este estado.",
  };
}
