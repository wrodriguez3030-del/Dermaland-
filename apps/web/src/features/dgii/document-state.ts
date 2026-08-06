// Por dónde puede pasar un comprobante fiscal, y por dónde no.
//
// POR QUÉ ESTO ES UNA TABLA Y NO UN PUÑADO DE `if`
//
// El estado de un e-CF lo mueven cuatro cosas distintas: la pantalla del ERP,
// un trabajo en segundo plano, la respuesta de la DGII y la consulta posterior
// por `trackId`. Si cada una lleva su propia idea de qué es válido, acaban
// discrepando — y con un documento fiscal, discrepar significa que la DGII y el
// sistema dicen cosas distintas del mismo comprobante.
//
// LAS DOS REGLAS QUE DE VERDAD IMPORTAN
//
//   1. **Un documento aceptado no retrocede.** Nunca. Una respuesta repetida,
//      una consulta que llega tarde o un reintento no pueden devolver a
//      `submitted` algo que la DGII ya autorizó. Es el fallo clásico de los
//      sistemas que hablan con un tercero: la red no entrega en orden.
//   2. **Un documento aceptado no se edita.** Lo que se hace con una factura
//      autorizada equivocada es una nota de crédito, no un `UPDATE`.
//
// Los nombres son los que YA tiene el CHECK de `electronic_invoices.status` en
// la base. No se inventan estados nuevos: cambiar el CHECK de una tabla fiscal
// para que encaje con un documento de diseño es empezar la casa por el tejado.

/** Los doce estados del CHECK de `electronic_invoices.status`. */
export const ECF_STATUSES = [
  "draft", // existe la intención, todavía no hay XML
  "generated", // XML construido, sin validar
  "validated", // pasó el XSD; listo para firmar
  "signed", // firmado y verificado en local
  "submitted", // entregado a la DGII, con acuse
  "in_process", // la DGII lo tiene y aún no resuelve
  "accepted", // autorizado
  "accepted_conditional", // autorizado con observaciones
  "rejected", // la DGII lo rechazó
  "cancelled", // anulado antes de que la DGII lo aceptara
  "error", // se rompió algo nuestro
  "voided", // sustituido por otro documento
] as const;

export type EcfStatus = (typeof ECF_STATUSES)[number];

/**
 * A dónde puede ir cada estado.
 *
 * `error` vuelve atrás a propósito: un fallo NUESTRO —se cayó la red, el
 * certificado no cargó— no quema el documento. Un rechazo de la DGII sí es
 * terminal, porque lo que corresponde es corregir y emitir otro, no reintentar
 * el mismo.
 */
const TRANSICIONES: Record<EcfStatus, readonly EcfStatus[]> = {
  draft: ["generated", "cancelled", "error"],
  generated: ["validated", "cancelled", "error"],
  validated: ["signed", "cancelled", "error"],
  signed: ["submitted", "cancelled", "error"],
  // Desde aquí ya no se puede cancelar por nuestra cuenta: el documento está
  // en manos de la DGII y quien decide es ella.
  submitted: ["in_process", "accepted", "accepted_conditional", "rejected", "error"],
  in_process: ["accepted", "accepted_conditional", "rejected", "error"],
  // Autorizado: solo puede quedar sustituido por otro documento fiscal.
  accepted: ["voided"],
  accepted_conditional: ["voided"],
  // Terminales de verdad.
  rejected: [],
  cancelled: [],
  voided: [],
  // `error` es un descansillo, no un final: se reintenta desde donde estaba.
  error: ["generated", "validated", "signed", "submitted", "cancelled"],
};

/** Estados que la DGII ya resolvió. Aquí el sistema deja de mandar. */
const AUTORIZADOS: readonly EcfStatus[] = ["accepted", "accepted_conditional"];

/** Estados de los que no se sale por ningún camino. */
export function isTerminal(status: EcfStatus): boolean {
  return TRANSICIONES[status].length === 0;
}

/** ¿La DGII lo autorizó? */
export function isAuthorized(status: EcfStatus): boolean {
  return AUTORIZADOS.includes(status);
}

/**
 * ¿Se puede seguir tocando el contenido del documento?
 *
 * Desde que se firma, no: el XML firmado es el documento, y cambiar cualquier
 * dato invalidaría la firma sin que nadie se entere hasta que la DGII lo
 * rechace. Se conserva `error` como editable porque ahí todavía no salió nada.
 */
export function isMutable(status: EcfStatus): boolean {
  return status === "draft" || status === "generated" || status === "validated";
}

export function canTransition(from: EcfStatus, to: EcfStatus): boolean {
  return TRANSICIONES[from].includes(to);
}

export function nextStatuses(from: EcfStatus): readonly EcfStatus[] {
  return TRANSICIONES[from];
}

export type TransitionResult =
  | { ok: true }
  /** Se ignora en silencio y NO es un fallo: la misma respuesta, dos veces. */
  | { ok: false; reason: "duplicada"; message: string }
  /** Llegó tarde algo que ya no aplica. Tampoco es un fallo. */
  | { ok: false; reason: "fuera-de-orden"; message: string }
  /** Esto sí es un fallo: alguien pidió algo imposible. */
  | { ok: false; reason: "invalida"; message: string };

/**
 * ¿Aplico esta transición?
 *
 * Devuelve tres «no» distintos a propósito, porque piden tres reacciones
 * distintas: la duplicada se ignora, la que llega tarde se registra y se
 * ignora, y la inválida es un error que alguien tiene que ver.
 *
 * Tratarlas todas como error llena la pantalla de alarmas por cosas normales
 * —la DGII responde dos veces, la consulta se cruza con el acuse— y entonces
 * nadie mira las alarmas.
 */
export function evaluateTransition(
  from: EcfStatus,
  to: EcfStatus,
): TransitionResult {
  if (from === to) {
    return {
      ok: false,
      reason: "duplicada",
      message: `El comprobante ya estaba en «${statusLabel(to)}».`,
    };
  }

  // LA REGLA: nada devuelve atrás un documento que la DGII autorizó.
  if (isAuthorized(from) && !canTransition(from, to)) {
    return {
      ok: false,
      reason: "fuera-de-orden",
      message: `Llegó «${statusLabel(to)}» para un comprobante ya autorizado. Se ignora: la autorización de la DGII manda.`,
    };
  }

  if (isTerminal(from)) {
    return {
      ok: false,
      reason: "fuera-de-orden",
      message: `El comprobante está en «${statusLabel(from)}», que es definitivo.`,
    };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: "invalida",
      message: `No se puede pasar de «${statusLabel(from)}» a «${statusLabel(to)}».`,
    };
  }

  return { ok: true };
}

const ETIQUETAS: Record<EcfStatus, string> = {
  draft: "Borrador",
  generated: "XML generado",
  validated: "Validado",
  signed: "Firmado",
  submitted: "Enviado a DGII",
  in_process: "En proceso en DGII",
  accepted: "Aceptado",
  accepted_conditional: "Aceptado con observaciones",
  rejected: "Rechazado por DGII",
  cancelled: "Anulado",
  error: "Con error",
  voided: "Sustituido",
};

/** Nunca se enseña la clave cruda: `accepted_conditional` no le dice nada a nadie. */
export function statusLabel(status: EcfStatus): string {
  return ETIQUETAS[status];
}
