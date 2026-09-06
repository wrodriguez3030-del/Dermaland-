/**
 * Tipos de la máquina de estados local de comprobantes e-CF (Fase 10B).
 * Pura/local: NO envía a DGII.
 */

export const INVOICE_STATUSES = [
  "draft",
  "generated",
  "validated",
  "signed",
  "prepared",
  "submitted",
  "in_process",
  "accepted",
  "accepted_conditional",
  "rejected",
  "cancelled",
  "error",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Estados terminales: no se puede volver a signed/prepared desde acá. */
export const TERMINAL_STATUSES: InvoiceStatus[] = ["accepted", "accepted_conditional", "rejected", "cancelled"];

/**
 * v530 — Estados en los que el comprobante YA SALIÓ y la venta no se puede tocar por detrás.
 *
 * El `TipoPago` del e-CF —contado o crédito— se deriva del estado de cobro de la venta al
 * momento de emitir. Si después se agrega un abono o se anula un pago, DGII se queda con un
 * comprobante que dice una cosa y la venta dice otra; y a diferencia de un error de captura,
 * esto no se arregla editando: hay que anular el comprobante y emitir uno nuevo.
 *
 * `submitted` e `in_process` entran a propósito: el documento ya está en manos de DGII
 * aunque todavía no haya veredicto. Los rechazados y cancelados NO entran — ahí el
 * comprobante no vale, la venta se corrige y se vuelve a emitir.
 */
export const STATUSES_QUE_CONGELAN_PAGOS: InvoiceStatus[] = [
  "submitted",
  "in_process",
  "accepted",
  "accepted_conditional",
];

/** ¿El comprobante de esta venta ya salió y congela sus pagos? */
export function congelaPagos(status: string | null | undefined): boolean {
  return !!status && (STATUSES_QUE_CONGELAN_PAGOS as string[]).includes(status);
}

export type TransitionInput = {
  currentStatus: InvoiceStatus;
  targetStatus: InvoiceStatus;
  /** Existe un dgii_submission preparado para este comprobante. */
  hasPreparedSubmission: boolean;
  /** TrackId DGII (solo existiría tras un envío real, fase futura). */
  trackId?: string | null;
  /** Respuesta DGII simulada presente (solo tests). */
  hasSimulatedResponse?: boolean;
  /**
   * v580 — El veredicto que vino en la PROPIA respuesta de recepción.
   *
   * El resumen RFCE (Factura de Consumo bajo el tope) se acepta en el acto y NO devuelve
   * TrackId: así está diseñado. Sin esto, la única evidencia que la guarda admitía para
   * marcar «aceptado» era un TrackId que ese camino nunca va a tener, o
   * `hasSimulatedResponse`, que añade el aviso de «no representa aceptación fiscal real»
   * y sería falso. Es evidencia de pleno derecho, no un permiso: la guarda comprueba que
   * el HTTP fue de éxito y que la DGII dijo algo.
   */
  respuestaRecepcion?: { httpStatus: number; estado: string } | null;
  ambiente: string | null;
  /** ¿Envío real permitido? En Fase 10B SIEMPRE false. */
  realSendAllowed: boolean;
};

export type TransitionResult = {
  allowed: boolean;
  nextStatus: InvoiceStatus | null;
  blockingReasons: string[];
  warnings: string[];
  auditAction: "dgii_invoice_status_transition" | "dgii_submission_status_transition_blocked";
};
