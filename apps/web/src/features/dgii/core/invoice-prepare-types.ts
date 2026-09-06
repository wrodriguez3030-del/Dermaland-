/**
 * Tipos de la preparación local de comprobantes e-CF (Fase 10A).
 * NO envía a DGII. NO expone XML firmado.
 */
import type { EcfItemRetencion, EcfTipoBuilder } from "./builder-types";

export type PrepareInvoiceItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  /** Tasa ITBIS en porcentaje (ej. 18 = 18%). */
  itbisRate: number;
  /** v351 — SOLO tipo 41 (obligatoria por ítem en su XSD). */
  retencion?: EcfItemRetencion | null;
  /**
   * v525 — Descuento monetario de la línea, en la misma moneda.
   *
   * El builder aplica la fórmula oficial de DGII: `MontoItem = precio·cantidad −
   * descuento`. Antes este campo no existía acá, así que el descuento de una venta se
   * perdía en el camino y el comprobante salía por el importe SIN descontar — más de lo
   * que la clienta pagó, con su ITBIS y su QR igual de inflados.
   *
   * Los tipos 43 y 47 NO admiten DescuentoMonto (lo asegura el XSD y lo valida el
   * builder); ninguno de los dos se emite desde una venta.
   */
  discount?: number | null;
};

/**
 * v528 — Forma de pago del comprobante (XSD `TipoPagoType`): 1=Contado, 2=Crédito.
 *
 * Estaba fijo en «contado» y la venta ya sabía la respuesta: una venta cobrada por completo
 * es contado; una con saldo pendiente es crédito. No es un matiz — es un campo del
 * comprobante que hasta ahora decía siempre lo mismo.
 */
export type PrepareInvoiceTipoPago = "1" | "2";

export type PrepareInvoiceCustomer = {
  rncOrCedula?: string | null;
  razonSocial?: string | null;
  /** v353 — receptores extranjeros (XSD 44/46/47). */
  identificadorExtranjero?: string | null;
  /** v353 — SOLO 46 (PaisComprador). */
  pais?: string | null;
} | null;

export type PrepareInvoiceReference = {
  ncfModificado: string;
  fechaNcfModificado: string;
  codigoModificacion: "1" | "2" | "3" | "4" | "5";
} | null;

export type PrepareDgiiInvoiceInput = {
  tipoEcf: EcfTipoBuilder;
  saleId?: string | null;
  customer?: PrepareInvoiceCustomer;
  items: PrepareInvoiceItem[];
  reference?: PrepareInvoiceReference;
  /** Advisory: no hay columna en DB todavía; la idempotencia real es por saleId/eNCF. */
  idempotencyKey?: string | null;
  /** v528 — 1=Contado, 2=Crédito. Sin valor, el builder usa su default («1»). */
  tipoPago?: PrepareInvoiceTipoPago | null;
};

export type PrepareDgiiInvoiceCtx = { businessId: string; userId: string; canWriteDgii: boolean };

export type PrepareDgiiInvoiceResult = {
  ok: boolean;
  invoiceId: string | null;
  eNcf: string | null;
  status: string | null;
  tipoEcf: string;
  ambiente: string | null;
  xmlSha256: string | null;
  signedAndVerified: boolean;
  xsdValid: boolean;
  submissionStatus: "prepared" | "no_sent" | "blocked" | null;
  /** ¿El XML firmado se guardó en el storage privado? */
  xmlSignedStored: boolean;
  /** Path redactado (sin businessId/IDs completos). Nunca el path real ni el XML. */
  xmlSignedPathRedacted?: string | null;
  /** true cuando se devolvió un comprobante ya existente (idempotencia por saleId). */
  idempotentHit?: boolean;
  warnings: string[];
  blockingReasons: string[];
};
