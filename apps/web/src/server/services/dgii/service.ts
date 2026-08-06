import "server-only";
import { env, isDgiiConfigured } from "@/lib/env";
import type { ElectronicInvoice, Proforma } from "@/types";
import { buildEcfXml, EcfBuilderUnsupported } from "./builder";
import { signEcfXml as signEcfXmlImpl } from "./signer";

/**
 * Barril del módulo DGII: reexporta las piezas reales de emisión.
 *
 * **Aquí NO vive lógica.** Cada pieza está en su archivo —`builder`, `signer`,
 * `validator`, `qr`, `security-code`, `pdf`, `proforma-to-input`— y esto solo
 * las agrupa para que una ruta importe de un sitio.
 *
 * QUÉ SE QUITÓ Y POR QUÉ
 *
 * Hasta ahora esto exportaba además un objeto `dgiiService` con métodos
 * `submitToDgii`, `getTrackStatus`, `cancelInvoice` y `createCreditNote` que
 * lanzaban `DgiiNotImplemented`. No lo usaba nadie, pero estaba en el mismo
 * archivo que las piezas que sí funcionan, y convivía con `testecf-client.ts`,
 * que es el camino de envío de verdad.
 *
 * Dos caminos para enviar un comprobante fiscal —uno real y otro que finge
 * existir— es como se acaba enviando por el equivocado. El que fingía se
 * eliminó; el que vale está en `testecf-client.ts` y sigue detrás de
 * `DGII_TESTECF_SEND_ENABLED`.
 */

export class DgiiNotConfigured extends Error {
  constructor(reason: string) {
    super(
      `DGII no configurada: ${reason}. dgii_enabled=false hasta cargar .p12 + persistir settings.`,
    );
    this.name = "DgiiNotConfigured";
  }
}


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
