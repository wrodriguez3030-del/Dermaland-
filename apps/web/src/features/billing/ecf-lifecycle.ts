import type { BillingSettings } from "./billing-settings-store";

/**
 * Máquina de estados e-CF (documento DGII §12).
 *
 * Modela el ciclo de vida interno de un comprobante electrónico SIN emisión
 * real. Es la "arquitectura real preparada" que el spec pide: define estados,
 * transiciones válidas y los GUARDS que bloquean el envío real mientras falte
 * cualquier precondición. En mock/demo, `simulateEcfFlow` recorre el flujo
 * completo marcando todo como mock — nunca llama a DGII ni consume secuencia
 * fiscal real.
 *
 * Pura y testeable: no toca red, ni archivos, ni el `dgiiService` real (que
 * por diseño lanza hasta que haya certificado + ambiente producción).
 */

export type EcfState =
  | "borrador"
  | "generado_xml"
  | "firmado"
  | "enviado_dgii"
  | "recibido_dgii"
  | "aceptado"
  | "rechazado"
  | "pendiente"
  | "enviado_receptor"
  | "acuse_recibido"
  | "aprobado_comercialmente"
  | "almacenado"
  | "anulado";

export const ECF_STATE_LABEL: Record<EcfState, string> = {
  borrador: "Borrador",
  generado_xml: "XML generado",
  firmado: "Firmado",
  enviado_dgii: "Enviado a DGII",
  recibido_dgii: "Recibido por DGII",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  pendiente: "Pendiente",
  enviado_receptor: "Enviado al receptor",
  acuse_recibido: "Acuse recibido",
  aprobado_comercialmente: "Aprobado comercialmente",
  almacenado: "Almacenado",
  anulado: "Anulado",
};

export type EcfEvent =
  | "generar_xml"
  | "firmar"
  | "enviar_dgii"
  | "recibir_dgii"
  | "aceptar"
  | "rechazar"
  | "marcar_pendiente"
  | "enviar_receptor"
  | "recibir_acuse"
  | "aprobar_comercial"
  | "almacenar"
  | "anular";

/** Transiciones válidas: estado → evento → estado destino. */
const TRANSITIONS: Record<EcfState, Partial<Record<EcfEvent, EcfState>>> = {
  borrador: { generar_xml: "generado_xml", anular: "anulado" },
  generado_xml: { firmar: "firmado", anular: "anulado" },
  firmado: { enviar_dgii: "enviado_dgii", anular: "anulado" },
  enviado_dgii: { recibir_dgii: "recibido_dgii" },
  recibido_dgii: {
    aceptar: "aceptado",
    rechazar: "rechazado",
    marcar_pendiente: "pendiente",
  },
  pendiente: { aceptar: "aceptado", rechazar: "rechazado" },
  aceptado: { enviar_receptor: "enviado_receptor", anular: "anulado" },
  enviado_receptor: { recibir_acuse: "acuse_recibido" },
  acuse_recibido: { aprobar_comercial: "aprobado_comercialmente" },
  aprobado_comercialmente: { almacenar: "almacenado" },
  almacenado: {},
  rechazado: {},
  anulado: {},
};

/** Estados terminales (no admiten más transiciones, salvo lo declarado). */
export const TERMINAL_STATES: ReadonlyArray<EcfState> = [
  "almacenado",
  "rechazado",
  "anulado",
];

export function isTerminal(state: EcfState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function canTransition(state: EcfState, event: EcfEvent): boolean {
  return Boolean(TRANSITIONS[state]?.[event]);
}

export type TransitionResult =
  | { ok: true; state: EcfState }
  | { ok: false; error: string };

/** Aplica un evento al estado actual. Falla si la transición no es válida. */
export function applyEcfEvent(state: EcfState, event: EcfEvent): TransitionResult {
  const next = TRANSITIONS[state]?.[event];
  if (!next) {
    return {
      ok: false,
      error: `Transición inválida: no se puede '${event}' desde '${ECF_STATE_LABEL[state]}'.`,
    };
  }
  return { ok: true, state: next };
}

// ─── Guards de envío real ───────────────────────────────────────────────────

export interface RealSendPreconditions {
  /** Certificado digital válido cargado. */
  hasValidCertificate: boolean;
  /** Rango e-NCF autorizado por DGII para el tipo a emitir. */
  hasAuthorizedRange: boolean;
  /** Endpoint oficial DGII configurado. */
  hasOfficialEndpoint: boolean;
  /** Business postulado/autorizado por DGII. */
  isBusinessAuthorized: boolean;
  /** Configuración fiscal completa (RNC emisor, etc.). */
  isFiscalConfigComplete: boolean;
}

export interface RealSendGuardResult {
  allowed: boolean;
  /** Razones por las que el envío real está bloqueado. */
  blockers: string[];
}

/**
 * Determina si el envío REAL a DGII está permitido. Bloquea si falta cualquier
 * precondición, si la emisión real no está habilitada, o si el ambiente no es
 * `producción`. En mock/demo SIEMPRE bloquea (por diseño).
 */
export function evaluateRealSendGuard(
  settings: BillingSettings,
  pre: RealSendPreconditions,
): RealSendGuardResult {
  const blockers: string[] = [];

  if (settings.ecfEnvironment !== "produccion") {
    blockers.push(
      `Ambiente '${settings.ecfEnvironment}': el envío real solo ocurre en 'producción'.`,
    );
  }
  if (!settings.realEmissionEnabled) {
    blockers.push("Emisión real DGII no habilitada (killswitch apagado).");
  }
  if (!pre.hasValidCertificate) blockers.push("Falta certificado válido.");
  if (!pre.hasAuthorizedRange) blockers.push("Falta rango e-NCF autorizado.");
  if (!pre.hasOfficialEndpoint) blockers.push("Falta endpoint oficial DGII.");
  if (!pre.isBusinessAuthorized) blockers.push("Business no autorizado por DGII.");
  if (!pre.isFiscalConfigComplete)
    blockers.push("Configuración fiscal incompleta.");

  return { allowed: blockers.length === 0, blockers };
}

// ─── Simulación de flujo mock/demo ──────────────────────────────────────────

export interface EcfFlowStep {
  state: EcfState;
  label: string;
  /** Detalle simulado del paso (track id demo, digest demo, etc.). */
  detail: string;
}

export interface SimulatedEcfFlow {
  /** Secuencia de estados recorridos. */
  steps: EcfFlowStep[];
  finalState: EcfState;
  /** Siempre true en mock/demo: ningún paso tocó DGII real. */
  isMock: true;
  /** Track id DEMO (no es un track real de DGII). */
  demoTrackId: string;
  /** Nunca consume secuencia fiscal real en mock/demo. */
  consumedRealSequence: false;
}

export interface SimulateEcfFlowInput {
  ecfNumber: string;
  settings: BillingSettings;
  /** Resultado a simular en DGII. Default 'aceptado'. */
  outcome?: "aceptado" | "rechazado" | "pendiente";
}

/**
 * Recorre el flujo completo en mock/demo produciendo la traza de estados.
 * NUNCA envía a DGII ni consume secuencia real. Si el outcome es 'aceptado',
 * continúa hasta 'almacenado' (incluye envío al receptor y aprobación
 * comercial, todos simulados).
 */
export function simulateEcfFlow(input: SimulateEcfFlowInput): SimulatedEcfFlow {
  const outcome = input.outcome ?? "aceptado";
  const demoTrackId = `DEMO-${input.ecfNumber}`;
  const steps: EcfFlowStep[] = [];

  let state: EcfState = "borrador";
  const push = (detail: string) =>
    steps.push({ state, label: ECF_STATE_LABEL[state], detail });

  push("Comprobante en borrador (mock).");

  const advance = (event: EcfEvent, detail: string) => {
    const r = applyEcfEvent(state, event);
    if (r.ok) {
      state = r.state;
      push(detail);
    }
  };

  advance("generar_xml", "XML generado en memoria (sin firma real).");
  advance("firmar", "Firma DEMO con certificado dummy (no fiscal).");
  advance(
    "enviar_dgii",
    "Envío SIMULADO — no se llamó al endpoint real de DGII.",
  );
  advance("recibir_dgii", `DGII (mock) asignó track id ${demoTrackId}.`);

  if (outcome === "rechazado") {
    advance("rechazar", "DGII (mock) rechazó el comprobante demo.");
  } else if (outcome === "pendiente") {
    advance("marcar_pendiente", "DGII (mock) dejó el comprobante pendiente.");
  } else {
    advance("aceptar", "DGII (mock) aceptó el comprobante demo.");
    advance("enviar_receptor", "Representación impresa enviada al receptor (demo).");
    advance("recibir_acuse", "Acuse de recibo simulado.");
    advance("aprobar_comercial", "Aprobación comercial simulada.");
    advance("almacenar", "XML/PDF/respuestas/logs almacenados (demo).");
  }

  return {
    steps,
    finalState: state,
    isMock: true,
    demoTrackId,
    consumedRealSequence: false,
  };
}
