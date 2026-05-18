import "server-only";
import { env, isDgiiConfigured } from "@/lib/env";
import type { ElectronicInvoice, Proforma } from "@/types";
import { buildEcfXml, EcfBuilderUnsupported } from "./builder";
import { signEcfXml as signEcfXmlImpl } from "./signer";

/**
 * DGII e-CF Service.
 *
 * Capa de abstracción sobre la API DGII (RD). Por ahora la mayoría de
 * métodos lanzan `DgiiNotConfigured` (si falta certificado / settings) o
 * `DgiiNotImplemented` (si la lógica real está pendiente de fases siguientes).
 *
 * Estado por método:
 *  - `generateXml` → delega al builder XSD-compliant (`./builder.ts`) cuando
 *    los datos de Proforma se pueden mapear; mientras tanto rechaza con
 *    `DgiiNotConfigured` porque el mapeo necesita `dgii_settings` y
 *    `ecf_sequences` (Fase B/C aplicadas).
 *  - `signXml` → pendiente Fase F (`signer.ts`).
 *  - `submitToDgii` → pendiente Fase H (`reception.ts`).
 *  - `getTrackStatus` → pendiente Fase H (`status.ts`).
 *  - `cancelInvoice` / `createCreditNote` → pendientes.
 *
 * Activación real:
 *  1. Aplicar migración `0003_dgii_pos.sql` (Fase B).
 *  2. Persistir settings + cert + secuencias (Fase C).
 *  3. Implementar signer + auth + reception + status (Fases F-H).
 *  4. `dgii_enabled = true` en `businesses` con autorización explícita.
 *
 * Riesgos asociados: R-DGII-01 a R-DGII-04 (`docs/riesgos.md`).
 */

export class DgiiNotConfigured extends Error {
  constructor(reason: string) {
    super(
      `DGII no configurada: ${reason}. dgii_enabled=false hasta cargar .p12 + persistir settings.`,
    );
    this.name = "DgiiNotConfigured";
  }
}

export class DgiiNotImplemented extends Error {
  constructor(method: string) {
    super(`DgiiService.${method}() no implementado. Pendiente fase futura.`);
    this.name = "DgiiNotImplemented";
  }
}

export type EcfType = "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45";

export interface SignedXmlResult {
  xml: string;
  digest: string;
  signedAt: string;
}

export interface DgiiSubmitResult {
  trackId: string;
  acceptedAt?: string;
  rejectedAt?: string;
  errors?: { code: string; message: string }[];
}

export interface DgiiService {
  /**
   * Genera el XML sin firmar para una proforma + tipo e-CF.
   *
   * El builder XSD-compliant vive en `./builder.ts` y se invoca con un input
   * estricto (`EcfBuilderInput`). Esta función orquesta el mapeo desde
   * `Proforma` (modelo interno) hacia ese input — mapeo que requiere
   * `dgii_settings` (emisor) y `ecf_sequences` (eNCF). Mientras esos no
   * persistan en DB, esta función lanza `DgiiNotConfigured`.
   *
   * El consumidor que quiera generar un XML directamente (e.g. para tests
   * de pre-certificación) puede importar `buildEcfXml` de `./builder` con
   * el input completo.
   */
  generateXml(proforma: Proforma, ecfType: EcfType): Promise<string>;

  /** Firma el XML con XAdES-BES usando el certificado del business. */
  signXml(unsignedXml: string, businessId: string): Promise<SignedXmlResult>;

  /** Envía el XML firmado al endpoint DGII (cert o prod según env). */
  submitToDgii(signedXml: string): Promise<DgiiSubmitResult>;

  /** Consulta el TrackID — DGII responde async. */
  getTrackStatus(trackId: string): Promise<DgiiSubmitResult>;

  /** Anula un e-CF previamente aceptado. */
  cancelInvoice(invoiceId: string, reason: string): Promise<void>;

  /** Crea Nota de Crédito (e-CF tipo 34) asociada a una factura origen. */
  createCreditNote(
    sourceInvoice: ElectronicInvoice,
    amount: number,
    reason: string,
  ): Promise<ElectronicInvoice>;
}

class DgiiServiceImpl implements DgiiService {
  private get baseUrl() {
    return env.DGII_ENVIRONMENT === "prod"
      ? "https://ecf.dgii.gov.do/ecf"
      : "https://ecf.dgii.gov.do/testecf";
  }

  async generateXml(_proforma: Proforma, ecfType: EcfType): Promise<string> {
    if (ecfType !== "31") {
      throw new EcfBuilderUnsupported(
        `Tipo e-CF ${ecfType} aún no soportado en Fase D (solo 31). ` +
          `32/33/34 llegan en Fase L del plan.`,
      );
    }
    // Mapeo proforma → EcfBuilderInput requiere:
    //   - dgii_settings (rncEmisor, razonSocial, dirección, fechas, etc.)
    //   - ecf_sequences (eNcf reservado atómicamente, fechaVencimientoSecuencia)
    //   - resolver client → RNCComprador
    // Estas piezas viven en Fase C (settings persistidos) + sequenceService.
    // Mientras tanto el caller que quiera generar XML real debe llamar
    // `buildEcfXml` directamente con todos los datos.
    throw new DgiiNotConfigured(
      "dgii_settings y ecf_sequences no disponibles todavía (Fase C pendiente). " +
        "Usa `buildEcfXml` de './builder' con un EcfBuilderInput completo para tests.",
    );
  }

  async signXml(_unsignedXml: string, _businessId: string): Promise<SignedXmlResult> {
    if (!isDgiiConfigured()) {
      throw new DgiiNotConfigured("certificado .p12 no cargado");
    }
    // El firmador puro vive en `./signer.ts` (Fase F, XMLDSig enveloped
    // RSA-SHA256 + SHA256, Reference URI vacío, KeyInfo X509). Para
    // invocarlo necesitamos PEM cert + PEM key descifrados, y eso requiere
    // el `DgiiCertificateService` (Fase C) que aún no existe. Mientras
    // tanto los callers que tengan el material clave ya descifrado pueden
    // importar `signEcfXml` de `./signer` directamente.
    throw new DgiiNotImplemented(
      "signXml: pendiente cableado a DgiiCertificateService (Fase C). " +
        "Usa `signEcfXml` de './signer' con PEM cert + PEM key en memoria.",
    );
  }

  async submitToDgii(_signedXml: string): Promise<DgiiSubmitResult> {
    if (!isDgiiConfigured()) {
      throw new DgiiNotConfigured("ambiente no inicializado");
    }
    throw new DgiiNotImplemented(`submitToDgii (base ${this.baseUrl})`);
  }

  async getTrackStatus(_trackId: string): Promise<DgiiSubmitResult> {
    if (!isDgiiConfigured()) throw new DgiiNotConfigured("sin certificado");
    throw new DgiiNotImplemented("getTrackStatus");
  }

  async cancelInvoice(_invoiceId: string, _reason: string): Promise<void> {
    throw new DgiiNotImplemented("cancelInvoice");
  }

  async createCreditNote(
    _sourceInvoice: ElectronicInvoice,
    _amount: number,
    _reason: string,
  ): Promise<ElectronicInvoice> {
    throw new DgiiNotImplemented("createCreditNote");
  }
}

export const dgiiService: DgiiService = new DgiiServiceImpl();

// Re-export del builder, firmador, validador, QR, security-code y PDF para
// callers que ya tengan el input listo (tests, scripts de pre-certificación,
// futuro `CertificateService`). Se exporta el firmador pero NO se exponen
// passwords ni paths a certs. El XSD se entrega como string al validador
// (caller lo carga desde bundle o filesystem según su contexto).
export { buildEcfXml, buildEcfXmlPretty } from "./builder";
export { signEcfXml, verifyEcfSignature } from "./signer";
export { validateEcfXml, DgiiValidatorError } from "./validator";
export {
  buildDgiiConsultaUrl,
  generateQrCodePng,
  generateQrCodeSvg,
  generateQrCodeDataUrl,
} from "./qr";
export { computeSecurityCode, DgiiSecurityCodeError } from "./security-code";
export { generateEcfPdf, DgiiPdfError } from "./pdf";
export { mapProformaToEcfInput } from "./proforma-to-input";
export type { MapProformaOptions } from "./proforma-to-input";
export type { EcfBuilderInput } from "./types";
export type { SignEcfXmlInput, SignEcfXmlResult } from "./signer";
export type {
  ValidateEcfXmlInput,
  ValidateEcfXmlResult,
  ValidationError,
} from "./validator";
export type { Ambiente, DgiiConsultaUrlInput, QrOptions } from "./qr";
export type { SecurityCodeOptions } from "./security-code";
export type { GenerateEcfPdfInput, EstadoDgii } from "./pdf";

// `signEcfXmlImpl` se importa arriba para que `service.signXml` pueda
// cablearlo cuando llegue Fase C. Re-export con el nombre `signEcfXml`
// público para uso externo.
void signEcfXmlImpl;
