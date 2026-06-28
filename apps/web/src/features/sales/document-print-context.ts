import type { Proforma } from "@/types";
import { classifySaleDocument, type SaleDocClass } from "./document-label";

/**
 * Contexto de impresión de un documento de venta — decide QUÉ datos fiscales
 * puede mostrar la representación impresa (ticket 80mm, PDF A4, WhatsApp).
 *
 * Regla dura: una factura tradicional **NCF** (B01/B02) NUNCA debe mostrar datos
 * de factura electrónica **e-CF** (e-NCF, validación DGII, código de seguridad,
 * fecha de firma, QR, modalidad de envío diferido). Una **proforma** no muestra
 * ningún dato fiscal. Solo el **e-CF** muestra los datos electrónicos.
 *
 * Esto centraliza el criterio para que todos los renders impriman lo mismo y no
 * se filtren textos e-CF en comprobantes que no lo son.
 */

export interface DocumentPrintContext {
  cls: SaleDocClass;
  isProforma: boolean;
  isNcf: boolean;
  isEcf: boolean;
  /** No hubo emisión fiscal real (ambiente demo / no convertido a e-CF). */
  isDemo: boolean;
  /** Número de comprobante a mostrar (B0x… para NCF, E3x… para e-CF). */
  fiscalNumber: string | null;
  /** Rótulo del número: "NCF" | "e-NCF" | "No." */
  numberLabel: "NCF" | "e-NCF" | "No.";
  /** Mostrar comprobante NCF tradicional. */
  showNcf: boolean;
  /** Mostrar comprobante electrónico e-NCF + bloque e-CF. */
  showEcf: boolean;
  /** Mostrar URL/validación DGII (ecf.dgii.gov.do). */
  showDgiiValidation: boolean;
  /** Mostrar código de seguridad e-CF. */
  showSecurityCode: boolean;
  /** Mostrar fecha de firma digital. */
  showDigitalSignature: boolean;
  /** Mostrar nota de modalidad de Envío Diferido. */
  showDeferredNote: boolean;
  /** Mostrar nota "ambiente demo / sin validez fiscal real" (solo facturas). */
  showFiscalDemoNote: boolean;
}

type DocFields = Pick<
  Proforma,
  "documentKind" | "ecfType" | "ecfNumber" | "number" | "status"
>;

/**
 * Calcula las banderas de impresión a partir del tipo de documento.
 *
 *  - `isNcf`  → billing_mode "ncf"  / document_type empieza con "B" → solo NCF.
 *  - `isEcf`  → billing_mode "ecf"  / document_type empieza con "E" → datos e-CF.
 *  - `isProforma` → todo lo fiscal en falso.
 */
export function getDocumentPrintContext(p: DocFields): DocumentPrintContext {
  const cls = classifySaleDocument(p);
  const isProforma = cls === "proforma";
  const isNcf = cls === "ncf";
  const isEcf = cls === "ecf";
  // "Emitido fiscalmente" en nuestro modelo = convertido a e-CF real.
  const isDemo = p.status !== "converted_to_ecf";

  return {
    cls,
    isProforma,
    isNcf,
    isEcf,
    isDemo,
    fiscalNumber: isProforma ? null : p.ecfNumber ?? p.number ?? null,
    numberLabel: isEcf ? "e-NCF" : isNcf ? "NCF" : "No.",
    showNcf: isNcf,
    showEcf: isEcf,
    showDgiiValidation: isEcf,
    showSecurityCode: isEcf,
    showDigitalSignature: isEcf,
    showDeferredNote: isEcf,
    // La proforma usa su propia nota ("no tiene validez fiscal"); la nota demo
    // aplica solo a facturas (NCF/e-CF) cuando no hubo emisión fiscal real.
    showFiscalDemoNote: !isProforma && isDemo,
  };
}
