/**
 * Máquina de estados local de comprobantes e-CF (Fase 10B). Pura y testeable.
 * NO envía a DGII; el paso a `submitted` queda bloqueado por killswitch.
 */
import {
  TERMINAL_STATUSES,
  type InvoiceStatus,
  type TransitionInput,
  type TransitionResult,
} from "./submission-state-types";

/** Transiciones permitidas (grafo). Los terminales no tienen salidas hacia signed/prepared. */
export const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["generated", "cancelled"],
  generated: ["validated", "cancelled"],
  validated: ["signed", "cancelled"],
  signed: ["prepared", "cancelled"],
  prepared: ["submitted", "cancelled"],
  /**
   * v615 — `accepted_conditional` faltaba acá y sí estaba en `in_process`.
   *
   * La DGII puede aceptar con condiciones en la respuesta del propio envío —el
   * normalizador lo devuelve y `estadoTrasEnvio` lo promueve—, así que el veredicto
   * llegaba, la transición se rechazaba por no estar en el grafo, y el comprobante se
   * quedaba en «Enviado, esperando respuesta» para siempre con la DGII habiéndolo
   * aceptado. Era un olvido: ningún test fijaba la ausencia.
   *
   * Abrirlo no relaja nada: la guarda de más abajo ya exige trackId o respuesta de la
   * DGII para `accepted` Y para `accepted_conditional`.
   */
  submitted: ["in_process", "accepted", "accepted_conditional", "rejected", "error"],
  in_process: ["accepted", "accepted_conditional", "rejected", "error"],
  accepted: [],
  accepted_conditional: [],
  rejected: [],
  cancelled: [],
  error: [],
};

export function evaluateTransition(input: TransitionInput): TransitionResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  // v501 — Producción fiscal ya NO bloquea toda transición por fase.
  //
  // Acá `input.ambiente === "ecf"` invalidaba CUALQUIER transición, incluidas las que no
  // tienen nada que ver con enviar: marcar un comprobante como preparado, o registrar un
  // rechazo. Era el bloqueo correcto mientras la certificación estaba pendiente; hoy sólo
  // impedía operar sobre comprobantes de producción que ya no se pueden emitir mal.
  //
  // Lo que sigue gobernando el envío es el punto 3: para pasar a `submitted` hacen falta
  // un submission preparado Y el killswitch de envío real. Eso no se tocó.

  // 2) La transición debe existir en el grafo.
  const allowedTargets = ALLOWED_TRANSITIONS[input.currentStatus] ?? [];
  const inGraph = allowedTargets.includes(input.targetStatus);
  if (!inGraph) {
    reasons.push(
      TERMINAL_STATUSES.includes(input.currentStatus)
        ? `'${input.currentStatus}' es un estado terminal; no admite transiciones.`
        : `Transición no permitida: ${input.currentStatus} → ${input.targetStatus}.`,
    );
  }

  // 3) submitted requiere submission preparado + envío real permitido (killswitch).
  if (input.targetStatus === "submitted") {
    if (!input.hasPreparedSubmission) reasons.push("No existe un dgii_submission preparado.");
    if (!input.realSendAllowed) reasons.push("Envío real bloqueado por killswitch (Fase 10B).");
  }

  // 4) accepted/accepted_conditional requieren trackId o respuesta DGII (simulada en tests).
  if (input.targetStatus === "accepted" || input.targetStatus === "accepted_conditional") {
    /**
     * v580 — Tercera forma de evidencia REAL: el veredicto que trae la propia respuesta de
     * recepción. El RFCE acepta en el acto y no emite TrackId, así que hasta ahora la única
     * salida para ese caso era saltarse esta guarda —que es lo que hacía v577— o mentir
     * declarándolo simulado. Se exige que el HTTP fuera de éxito y que la DGII dijera algo:
     * un 500 con un cuerpo raro no puede convertirse en «la DGII lo aceptó».
     */
    const r = input.respuestaRecepcion;
    const veredictoEnRespuesta =
      r != null && r.httpStatus >= 200 && r.httpStatus < 300 && typeof r.estado === "string" && r.estado.trim() !== "";
    const hasEvidence = Boolean(input.trackId) || input.hasSimulatedResponse === true || veredictoEnRespuesta;
    if (!hasEvidence) reasons.push("No se puede marcar aceptado sin trackId/respuesta DGII.");
    if (input.hasSimulatedResponse && !input.trackId) warnings.push("Aceptación basada en respuesta SIMULADA; no representa aceptación fiscal real.");
  }

  const allowed = reasons.length === 0;
  return {
    allowed,
    nextStatus: allowed ? input.targetStatus : null,
    blockingReasons: reasons,
    warnings,
    auditAction: allowed ? "dgii_invoice_status_transition" : "dgii_submission_status_transition_blocked",
  };
}
