/**
 * Las listas canónicas del módulo fiscal. Un solo sitio: las migraciones, el
 * verificador y las guardas se comprueban todos contra esto.
 *
 * `TABLAS_LEGACY` son las 13 del módulo que DermaLand tenía y que nunca emitió un
 * comprobante. No se borran: se renombran con fecha, para poder volver atrás.
 */

/**
 * Las 18 del esquema fiscal nuevo. Orden: emisión, recepción, certificación,
 * historial.
 *
 * Diecisiete vienen del módulo de agendapp. La decimoctava,
 * `ecf_document_events`, NO: es trabajo propio de DermaLand
 * (`0045_ecf_idempotency_and_events.sql:60-108`) y hoy la escribe código vivo
 * (`server/services/dgii/transitions.ts:305`). La parte 1 la retira con las
 * otras 12 —su clave foránea apunta a `electronic_invoices`, que sí se
 * renombra— y la parte 2 la vuelve a crear, con su trigger append-only y su FK
 * `on delete restrict`. La tabla vieja está vacía, así que no se pierde nada.
 * Ver C2 de la revisión final de la rama.
 */
export const TABLAS_NUEVAS = [
  "dgii_settings",
  "dgii_certificates",
  "ecf_sequences",
  "electronic_invoices",
  "electronic_invoice_items",
  "dgii_submissions",
  "dgii_status_logs",
  "dgii_enablement_progress",
  "dgii_representative_attestations",
  "received_ecf",
  "received_commercial_approvals",
  "dgii_certification_datasets",
  "dgii_certification_cases",
  "dgii_simulation_ranges",
  "dgii_certification_applications",
  "dgii_certification_events",
  "dgii_certification_evidence",
  "ecf_document_events",
] as const;

/** Las 13 del módulo viejo. Todas vacías salvo `dgii_certificates` (4 filas, 3 revocadas). */
export const TABLAS_LEGACY = [
  "dgii_settings",
  "dgii_certificates",
  "ecf_sequences",
  "electronic_invoices",
  "electronic_invoice_items",
  "dgii_submissions",
  "dgii_status_logs",
  "dgii_received_ecf",
  "dgii_commercial_approvals",
  "proforma_to_ecf_logs",
  "dgii_logs",
  "ecf_document_events",
  "cash_closing_ecf_items",
] as const;

/** La fecha va en el nombre: un `_legacy` a secas no dice de qué retirada es. */
export const SUFIJO_LEGACY = "_legacy_20260906";

export function nombreLegacy(tabla: string): string {
  return `${tabla}${SUFIJO_LEGACY}`;
}
