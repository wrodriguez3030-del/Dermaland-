// Cuándo avisar de que el certificado se acaba.
//
// Un certificado vencido no da un error a medias: **no se puede emitir ni un
// comprobante**. Y no se renueva en una tarde — hay que ir a la autoridad
// certificadora, pagar, validar identidad. Enterarse el día que caduca es
// enterarse tarde.
//
// El pliego (§15) pide avisar a 30, 15, 7, 3, 1 y 0 días. Los umbrales se
// aprietan según se acerca a propósito: a treinta días el aviso es una nota
// para la agenda; a tres es una urgencia.
//
// Y **cada umbral avisa una sola vez**. Un correo diario durante treinta días
// es cómo se enseña a la gente a filtrar los correos del sistema.

/** Los seis avisos, de lejos a cerca. */
export const UMBRALES_DIAS = [30, 15, 7, 3, 1, 0] as const;

export type ExpiryLevel = "ok" | "aviso" | "urgente" | "critico" | "vencido";

export interface ExpiryAssessment {
  /** Días naturales que faltan. Negativo = ya venció. */
  daysLeft: number;
  level: ExpiryLevel;
  /** El umbral que corresponde notificar ahora, o `null` si no toca. */
  threshold: (typeof UMBRALES_DIAS)[number] | null;
  /** Frase para la pantalla y para el correo. */
  message: string;
  /** ¿Todavía se puede emitir? */
  canIssue: boolean;
}

/** Días naturales entre dos fechas, contando por día y no por horas. */
function diasHasta(desde: Date, hasta: Date): number {
  const d0 = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const d1 = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((d1 - d0) / 86_400_000);
}

/**
 * En qué situación está el certificado.
 *
 * `now` entra por parámetro: sin eso, la prueba tendría que esperar a que pase
 * el tiempo.
 */
export function assessCertificateExpiry(
  expiresAt: Date | string,
  now: Date,
): ExpiryAssessment {
  const vence = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;

  if (Number.isNaN(vence.getTime())) {
    // Sin fecha legible no se puede afirmar que sirva. Se avisa, no se calla.
    return {
      daysLeft: 0,
      level: "critico",
      threshold: 0,
      message:
        "No se pudo leer la fecha de vencimiento del certificado. Vuelve a cargarlo.",
      canIssue: false,
    };
  }

  const dias = diasHasta(now, vence);

  if (dias < 0) {
    return {
      daysLeft: dias,
      level: "vencido",
      threshold: 0,
      message: `El certificado digital venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}. No se puede emitir hasta renovarlo.`,
      canIssue: false,
    };
  }

  // El umbral que toca es el MÁS APRETADO que ya se alcanzó. Se recorre de
  // cerca a lejos: a 15 días corresponde el aviso de 15, no el de 30, que ya
  // se mandó cuando quedaban treinta.
  const umbral =
    [...UMBRALES_DIAS].reverse().find((u) => dias <= u) ?? null;

  if (umbral === null) {
    return {
      daysLeft: dias,
      level: "ok",
      threshold: null,
      message: `El certificado vence en ${dias} días.`,
      canIssue: true,
    };
  }

  const nivel: ExpiryLevel =
    dias === 0 ? "critico" : dias <= 3 ? "critico" : dias <= 7 ? "urgente" : "aviso";

  const cuando =
    dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;

  return {
    daysLeft: dias,
    level: nivel,
    threshold: umbral,
    message:
      dias === 0
        ? "El certificado digital vence HOY. Después de hoy no se podrá emitir."
        : `El certificado digital vence ${cuando}. Renuévalo antes: sin él no se puede emitir ni un comprobante.`,
    // Vence hoy todavía sirve hoy.
    canIssue: true,
  };
}

/**
 * Llave de notificación: **certificado + umbral**.
 *
 * Es lo que impide el correo diario durante treinta días. Con un índice único
 * detrás, el segundo intento de avisar del mismo umbral choca contra la base.
 *
 * Lleva la huella del certificado y no su id: si se sustituye por uno nuevo con
 * la misma fecha, los avisos deben empezar de cero.
 */
export function expiryNotificationKey(
  certificateThumbprint: string,
  threshold: number,
): string {
  return `cert:${certificateThumbprint.trim().toLowerCase()}:d${threshold}`;
}

/** ¿Hay que mandar aviso ahora, sabiendo cuáles ya se mandaron? */
export function shouldNotify(
  assessment: ExpiryAssessment,
  alreadySent: ReadonlySet<number>,
): boolean {
  if (assessment.threshold === null) return false;
  return !alreadySent.has(assessment.threshold);
}
