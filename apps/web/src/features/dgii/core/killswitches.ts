/**
 * Killswitches y gates de preflight DGII. Puro salvo la lectura de env en
 * `getDgiiSendEnvironmentFlags`. NO envía nada, NO hace fetch.
 *
 * v570 — Decía «(Fase 8) … en Fase 8 SIEMPRE resulta no permitido», y el propio archivo lo
 * desmentía cien líneas más abajo: v501 quitó ese bloqueo incondicional cuando la
 * certificación se cerró 15/15, y lo explica ahí mismo. Un encabezado que contradice a su
 * archivo es peor que ninguno, porque es lo primero que lee quien viene a entenderlo.
 *
 * Lo que sí sigue siendo cierto, y es lo que hace este módulo: el envío real exige las DOS
 * llaves —la del entorno y la del negocio— y todos los gates de `evaluateDgiiPreflightGates`.
 */

export type DgiiAmbienteTarget = "testecf" | "certecf" | "ecf";

export type DgiiSendEnvironmentFlags = {
  testecf: boolean;
  certecf: boolean;
  prod: boolean;
};

/** Lee los flags de envío del entorno. Default false (solo "true" habilita). */
export function getDgiiSendEnvironmentFlags(): DgiiSendEnvironmentFlags {
  return {
    testecf: process.env.DGII_TESTECF_SEND_ENABLED === "true",
    certecf: process.env.DGII_CERTECF_SEND_ENABLED === "true",
    prod: process.env.DGII_PROD_SEND_ENABLED === "true",
  };
}

export function envFlagForAmbiente(flags: DgiiSendEnvironmentFlags, a: DgiiAmbienteTarget): boolean {
  return a === "testecf" ? flags.testecf : a === "certecf" ? flags.certecf : flags.prod;
}

/** Normaliza el ambiente guardado en `dgii_settings` al del killswitch. */
export function ambienteTargetOf(a: string | null | undefined): DgiiAmbienteTarget {
  return a === "certecf" ? "certecf" : a === "ecf" ? "ecf" : "testecf";
}

/**
 * ¿Está permitido el envío real? Los DOS interruptores: el del entorno (Vercel) y el del
 * negocio (`dgii_enabled_real_send`).
 *
 * v530 — Vivía privada en `submission-service.ts`, que es el módulo que ADEMÁS arrastra
 * storage y cliente HTTP de DGII (por eso v527 lo carga diferido). El POS necesita el mismo
 * hecho para no mentirle a la cajera, y copiarlo habría dejado dos definiciones de «se puede
 * enviar» — exactamente lo que este proyecto no permite. Vive acá, que es puro y es el hogar
 * de los gates; `submission-service` la importa.
 *
 * OJO: esto responde «los killswitches dejan», no «el comprobante va a salir». El envío real
 * exige además que la habilitación esté en un estado transmisible y que pase el preflight —
 * eso lo evalúa `submission-service`, que es quien envía.
 */
export function realSendAllowedFor(ambiente: string | null | undefined, tenantRealSend: boolean): boolean {
  return envFlagForAmbiente(getDgiiSendEnvironmentFlags(), ambienteTargetOf(ambiente)) && tenantRealSend;
}

export type PreflightGateInput = {
  targetAmbiente: DgiiAmbienteTarget;
  tenantAmbiente: string | null;
  settingsExists: boolean;
  dgiiEnabledRealSend: boolean;
  hasActiveCertificate: boolean;
  certificateExpired: boolean;
  hasActiveSequence: boolean;
  sequenceExhausted: boolean;
  postulationConfirmed: boolean;
  rangeAuthorized: boolean;
  userConfirmed: boolean;
  canWriteDgii: boolean;
  envFlags: DgiiSendEnvironmentFlags;
};

export type PreflightChecklistItem = {
  key: string;
  label: string;
  ok: boolean;
  /** Si es requerido para envío real. */
  requiredForLive: boolean;
};

export type DgiiPreflightResult = {
  /** ¿Envío REAL permitido AHORA? Las dos llaves a la vez, entorno y negocio. */
  allowed: boolean;
  mode: "dry-run" | "blocked" | "future-live";
  blockingReasons: string[];
  warnings: string[];
  checklist: PreflightChecklistItem[];
};

/** Error lanzado por el cliente DGII cuando el envío está deshabilitado. */
export class DgiiSendDisabledError extends Error {
  constructor(message = "Envío DGII deshabilitado por killswitch.") {
    super(message);
    this.name = "DgiiSendDisabledError";
  }
}

export function evaluateDgiiPreflightGates(input: PreflightGateInput): DgiiPreflightResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const checklist: PreflightChecklistItem[] = [];

  const add = (key: string, label: string, ok: boolean, requiredForLive: boolean) =>
    checklist.push({ key, label, ok, requiredForLive });

  // RBAC
  add("rbac_dgii", "Permiso para el módulo DGII", input.canWriteDgii, true);
  if (!input.canWriteDgii) blockingReasons.push("Sin permiso para el módulo DGII.");

  // v501 — Producción fiscal ya NO se bloquea por fase.
  //
  // Acá vivía un bloqueo incondicional («Fase 8»): con `targetAmbiente = "ecf"` la
  // evaluación devolvía `blocked` sin mirar nada más. Era correcto mientras la
  // certificación DGII estaba pendiente — emitir un e-CF real sin certificar es un
  // problema fiscal de verdad, y ningún otro gate lo habría impedido con tanta claridad.
  //
  // La certificación se completó 15/15 el 2026-07-28. El bloqueo pasó a describir un mundo
  // que ya no existe, y sobre todo pasó a TAPAR los gates que sí importan: con `blocked`
  // por fase, el dueño no podía ver cuál de los otros once le faltaba realmente.
  //
  // Lo que protege ahora, y sigue intacto abajo: permiso RBAC, killswitch de entorno del
  // ambiente objetivo, configuración fiscal, coincidencia de ambiente, certificado activo
  // y vigente, secuencia activa y no agotada, postulación confirmada, rango autorizado por
  // DGII y confirmación manual. Ninguno se relajó en este cambio.

  // Env killswitch del ambiente objetivo.
  const envOn = envFlagForAmbiente(input.envFlags, input.targetAmbiente);
  add("env_killswitch", `Killswitch de entorno (${input.targetAmbiente})`, envOn, true);
  if (!envOn) blockingReasons.push(`Killswitch de envío ${input.targetAmbiente} apagado (env).`);

  // Configuración fiscal
  add("settings", "Configuración fiscal DGII", input.settingsExists, true);
  if (!input.settingsExists) blockingReasons.push("Falta la configuración fiscal (dgii_settings).");

  // Ambiente del tenant coincide
  const ambienteMatch = input.tenantAmbiente === input.targetAmbiente;
  add("ambiente_match", `Ambiente del tenant = ${input.targetAmbiente}`, ambienteMatch, true);
  if (!ambienteMatch) {
    blockingReasons.push(
      `Ambiente del tenant (${input.tenantAmbiente ?? "—"}) no coincide con el objetivo (${input.targetAmbiente}).`,
    );
  }

  // Killswitch por tenant: para dry-run debe estar APAGADO.
  add("tenant_real_send_off", "Envío real por tenant apagado (dry-run)", !input.dgiiEnabledRealSend, false);
  if (input.dgiiEnabledRealSend) warnings.push("dgii_enabled_real_send está activo; en dry-run no se envía igual.");

  // Certificado
  add("cert_active", "Certificado activo", input.hasActiveCertificate, true);
  if (!input.hasActiveCertificate) blockingReasons.push("No hay certificado activo.");
  add("cert_vigente", "Certificado vigente (no vencido)", input.hasActiveCertificate && !input.certificateExpired, true);
  if (input.hasActiveCertificate && input.certificateExpired) blockingReasons.push("El certificado está vencido.");

  // Secuencia
  add("sequence_active", "Secuencia e-NCF activa", input.hasActiveSequence, true);
  if (!input.hasActiveSequence) blockingReasons.push("No hay secuencia e-NCF activa.");
  add("sequence_not_exhausted", "Rango e-NCF no agotado", input.hasActiveSequence && !input.sequenceExhausted, true);
  if (input.hasActiveSequence && input.sequenceExhausted) blockingReasons.push("La secuencia e-NCF está agotada.");

  // Gates externos: dependen de la DGII y del dueño, no de la app.
  add("postulacion", "Postulación DGII confirmada", input.postulationConfirmed, true);
  if (!input.postulationConfirmed) blockingReasons.push("Postulación DGII pendiente.");
  add("rango_autorizado", "Rango e-NCF autorizado por DGII", input.rangeAuthorized, true);
  if (!input.rangeAuthorized) blockingReasons.push("Rango e-NCF autorizado por DGII pendiente.");

  // Confirmación manual (para envío real)
  add("confirmacion_manual", "Confirmación manual del usuario", input.userConfirmed, true);
  if (!input.userConfirmed) blockingReasons.push("Confirmación manual pendiente.");

  const allowed = blockingReasons.length === 0;
  // v501 — `!isProd` salió de acá: lo estructural es tener permiso, configuración,
  // ambiente coherente, certificado y secuencia. En qué ambiente se está no es un defecto
  // de estructura.
  const structuralOk =
    input.canWriteDgii && input.settingsExists && ambienteMatch &&
    input.hasActiveCertificate && !input.certificateExpired &&
    input.hasActiveSequence && !input.sequenceExhausted;

  let mode: DgiiPreflightResult["mode"];
  // Sin permiso sigue siendo `blocked`: es lo único que no se resuelve completando pasos.
  if (!input.canWriteDgii) mode = "blocked";
  else if (structuralOk) mode = "future-live"; // listo salvo killswitches/postulación/rango/confirmación
  else mode = "dry-run";

  return { allowed, mode, blockingReasons, warnings, checklist };
}

/** Lanza DgiiSendDisabledError si el envío real no está permitido. */
export function assertDgiiSendAllowed(gates: DgiiPreflightResult): void {
  if (!gates.allowed) {
    throw new DgiiSendDisabledError(
      `Envío DGII bloqueado: ${gates.blockingReasons.slice(0, 3).join(" ") || "killswitch activo"}`,
    );
  }
}
