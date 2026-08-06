// Qué coge la cola, cuánto y en qué orden.
//
// Aislado y puro a propósito. La decisión de «qué se procesa ahora» es donde se
// esconden los desastres de una cola: coger demasiado y agotar el tiempo de la
// función; coger lo que no tocaba y reenviar un comprobante ya aceptado; coger
// siempre los mismos y dejar los últimos sin salir nunca.
//
// Con esto fuera del trabajador, esas tres cosas se pueden probar sin base de
// datos, sin red y sin reloj.

import { isTerminal, type EcfStatus } from "./document-state";

/**
 * Cuántos por pasada.
 *
 * Bajo a propósito. Una función de Vercel tiene un techo de tiempo, y cada
 * comprobante implica hablar con la DGII. Vale más terminar diez de verdad que
 * empezar cien y que la función muera a la mitad dejando a saber qué a medias.
 */
export const LOTE_MAXIMO = 10;

/** Estados desde los que la cola puede seguir empujando. */
const PROCESABLES: readonly EcfStatus[] = [
  "generated", // le falta validar
  "validated", // le falta firmar
  "signed", // le falta enviar
  "submitted", // enviado; toca consultar
  "in_process", // la DGII no ha resuelto; toca consultar
  "error", // falló y tiene cita para reintentar
];

export interface QueueCandidate {
  id: string;
  status: EcfStatus;
  /** ISO. `null` = sin cita pendiente. */
  nextRetryAt: string | null;
  retryCount: number;
  createdAt: string;
}

export interface PickOptions {
  /** El «ahora». Entra por parámetro para que esto sea puro. */
  now: Date;
  limit?: number;
}

/**
 * ¿Le toca a este documento?
 *
 * Un documento con cita en el futuro **no** se toca: esa espera es justo lo que
 * impide martillear a la DGII, y saltársela anula el backoff entero.
 */
export function isDue(candidate: QueueCandidate, now: Date): boolean {
  if (isTerminal(candidate.status)) return false;
  if (!PROCESABLES.includes(candidate.status)) return false;
  if (candidate.nextRetryAt === null) return true;

  const cita = Date.parse(candidate.nextRetryAt);
  // Una fecha ilegible no puede bloquear un documento para siempre: se procesa
  // y el trabajador ya decidirá. Peor que reintentar de más es no reintentar
  // nunca y que la venta se quede sin comprobante.
  if (Number.isNaN(cita)) return true;
  return cita <= now.getTime();
}

/**
 * Qué se procesa en esta pasada.
 *
 * Orden: **primero el que más lleva esperando**. Así un pico de comprobantes
 * nuevos no deja atrás a los viejos; sin esto, un documento con mala suerte se
 * queda al final de la fila para siempre.
 *
 * A igualdad de antigüedad, primero el que menos veces ha fallado: hay más
 * probabilidad de que salga y de que el lote avance.
 */
export function pickBatch(
  candidates: readonly QueueCandidate[],
  options: PickOptions,
): QueueCandidate[] {
  const limite = Math.max(0, Math.min(options.limit ?? LOTE_MAXIMO, LOTE_MAXIMO));
  return candidates
    .filter((c) => isDue(c, options.now))
    .sort((a, b) => {
      const porFecha = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (porFecha !== 0) return porFecha;
      return a.retryCount - b.retryCount;
    })
    .slice(0, limite);
}

/** Qué hay que hacerle a un documento según dónde está. */
export type QueueAction = "validar" | "firmar" | "enviar" | "consultar" | "reintentar";

/**
 * Las dos acciones que HABLAN CON LA DGII.
 *
 * Separadas y nombradas porque son la frontera entre «esto se deshace» y «esto
 * ya no». Todo lo anterior —construir, validar contra el XSD, firmar— ocurre en
 * casa y se puede repetir mil veces sin consecuencias. En cuanto se envía, el
 * e-NCF está gastado.
 */
const HABLAN_CON_DGII: readonly QueueAction[] = ["enviar", "consultar"];

export function touchesDgii(action: QueueAction): boolean {
  return HABLAN_CON_DGII.includes(action);
}

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: "envio-deshabilitado"; message: string };

/**
 * ¿Puede el trabajador ejecutar esta acción ahora mismo?
 *
 * El freno vive AQUÍ, en una función pura y probada, y no repartido por el
 * trabajador. Un `if (env...)` metido en medio de un bucle es justo el sitio
 * donde alguien lo mueve sin darse cuenta de lo que estaba frenando.
 *
 * Con el envío deshabilitado, el trabajador **sí** adelanta trabajo local
 * —validar y firmar— y se para justo antes de hablar con la DGII. Así, el día
 * que se habilite, lo que hay pendiente sale de inmediato en vez de empezar de
 * cero.
 */
export function gateAction(
  action: QueueAction,
  sendEnabled: boolean,
): GateDecision {
  if (!touchesDgii(action) || sendEnabled) return { allowed: true };
  return {
    allowed: false,
    reason: "envio-deshabilitado",
    message:
      "El envío a DGII está deshabilitado. El comprobante queda preparado y saldrá cuando se habilite.",
  };
}

export function actionFor(status: EcfStatus): QueueAction | null {
  switch (status) {
    case "generated":
      return "validar";
    case "validated":
      return "firmar";
    case "signed":
      return "enviar";
    case "submitted":
    case "in_process":
      // Enviado y sin respuesta: se CONSULTA. Reenviar duplicaría el
      // comprobante, que es el error que no se puede cometer.
      return "consultar";
    case "error":
      return "reintentar";
    default:
      return null;
  }
}
