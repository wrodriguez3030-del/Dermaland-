/**
 * Las listas canónicas del módulo fiscal. Un solo sitio: las migraciones, el
 * verificador y las guardas se comprueban todos contra esto.
 *
 * `TABLAS_LEGACY` son las 13 del módulo que DermaLand tenía y que nunca emitió un
 * comprobante. No se borran: se renombran con fecha, para poder volver atrás.
 */

/** Las 17 que trae el módulo de agendapp. Orden: emisión, recepción, certificación. */
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
