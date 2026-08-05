// ¿Este fallo se reintenta, o se corrige?
//
// Es LA pregunta de un módulo fiscal, y contestarla mal cuesta de las dos
// maneras:
//
//   · Reintentar lo que no se arregla solo —un RNC mal escrito, un XML que no
//     cumple el esquema— es golpear a la DGII cada quince minutos para siempre
//     con la misma respuesta.
//   · **No** reintentar lo que sí se arregla solo —un tiempo de espera agotado,
//     un 503— es dejar una venta sin comprobante fiscal porque hubo un bache de
//     red de tres segundos.
//
// Y hay un caso peor que los dos: el tiempo de espera agotado DESPUÉS de haber
// entregado el XML. La DGII pudo recibirlo perfectamente y perderse la
// respuesta. Reintentar a ciegas ahí es arriesgarse a emitir dos veces el mismo
// comprobante. Por eso `TIMEOUT` se reintenta **solo si aún no se entregó**, y
// si ya se entregó lo que toca es consultar por `trackId`, no reenviar.

export const ERROR_CLASSES = [
  "VALIDATION", // el documento no cumple; lo arregla una persona
  "AUTHENTICATION", // token vencido o semilla rechazada; se renueva y va
  "NETWORK", // no se llegó a hablar
  "TIMEOUT", // se habló y no se supo el final
  "DGII_REJECTION", // la DGII dijo que no; es una respuesta, no un fallo
  "CONFIGURATION", // falta algo que alguien tiene que poner
  "CERTIFICATE", // el certificado no sirve
  "INTERNAL", // se rompió algo nuestro
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

export interface ClassifiedError {
  class: ErrorClass;
  /** ¿Tiene sentido volver a intentarlo tal cual? */
  transient: boolean;
  /** Qué se hace ahora. Es lo que se enseña y lo que decide el trabajo. */
  action: "reintentar" | "consultar-estado" | "corregir" | "configurar";
  /** Para la pantalla. Nunca la clase cruda ni el cuerpo de la respuesta. */
  message: string;
}

export interface ClassifyInput {
  /** Código HTTP, si se llegó a recibir uno. */
  httpStatus?: number;
  /** Código de la DGII, si vino. */
  dgiiCode?: string;
  /** Nombre del error de red de Node: `ETIMEDOUT`, `ECONNREFUSED`… */
  networkCode?: string;
  /**
   * ¿Se llegó a entregar el XML antes de perder la respuesta?
   *
   * Cambia por completo qué hacer ante un tiempo agotado: sin entregar se
   * reenvía; entregado se **consulta**, porque reenviar duplicaría el
   * comprobante.
   */
  delivered?: boolean;
  /** Falta configuración conocida. */
  missingConfig?: boolean;
  certificateProblem?: boolean;
}

/** Códigos HTTP que casi siempre se arreglan solos. */
const HTTP_TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Errores de red de Node que son un bache, no un problema del documento. */
const RED_TRANSITORIA = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ESOCKETTIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export function classifyDgiiError(input: ClassifyInput): ClassifiedError {
  const { httpStatus, networkCode, delivered, missingConfig, certificateProblem } =
    input;

  // Lo que impide siquiera intentarlo va primero: no tiene sentido hablar de
  // reintentos si falta el certificado.
  if (certificateProblem) {
    return {
      class: "CERTIFICATE",
      transient: false,
      action: "configurar",
      message:
        "El certificado digital no se pudo usar. Revisa que esté cargado, vigente y con la contraseña correcta.",
    };
  }

  if (missingConfig) {
    return {
      class: "CONFIGURATION",
      transient: false,
      action: "configurar",
      message:
        "Falta configuración fiscal para emitir. Complétala en Facturación electrónica → Configuración.",
    };
  }

  // Tiempo de espera agotado: el caso delicado.
  const esTimeout =
    httpStatus === 408 ||
    (networkCode !== undefined &&
      (networkCode.includes("TIMEOUT") || networkCode === "ETIMEDOUT"));

  if (esTimeout) {
    return delivered
      ? {
          class: "TIMEOUT",
          // NO se reintenta: la DGII pudo recibirlo y perderse la respuesta.
          transient: false,
          action: "consultar-estado",
          message:
            "Se envió y no llegó la respuesta. Se consultará el estado en DGII; no se reenvía para no duplicar el comprobante.",
        }
      : {
          class: "TIMEOUT",
          transient: true,
          action: "reintentar",
          message: "La DGII no respondió a tiempo. Se reintentará.",
        };
  }

  if (networkCode && RED_TRANSITORIA.has(networkCode)) {
    return {
      class: "NETWORK",
      transient: true,
      action: "reintentar",
      message: "No se pudo conectar con la DGII. Se reintentará.",
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      class: "AUTHENTICATION",
      // Transitorio a propósito: el token se renueva y el envío sigue.
      transient: true,
      action: "reintentar",
      message: "La sesión con la DGII caducó. Se renovará y se reintentará.",
    };
  }

  if (httpStatus !== undefined && HTTP_TRANSITORIOS.has(httpStatus)) {
    return {
      class: "NETWORK",
      transient: true,
      action: "reintentar",
      message: "La DGII no está respondiendo bien ahora mismo. Se reintentará.",
    };
  }

  // 400 y 422: la DGII entendió y dice que el documento está mal.
  if (httpStatus === 400 || httpStatus === 422) {
    return {
      class: "VALIDATION",
      transient: false,
      action: "corregir",
      message:
        "La DGII rechazó el documento por su contenido. Hay que corregirlo y emitir uno nuevo.",
    };
  }

  // 409: ya lo tienen. No es un fallo, es que llegó dos veces.
  if (httpStatus === 409) {
    return {
      class: "DGII_REJECTION",
      transient: false,
      action: "consultar-estado",
      message: "La DGII ya tenía este comprobante. Se consultará su estado.",
    };
  }

  if (input.dgiiCode) {
    return {
      class: "DGII_REJECTION",
      transient: false,
      action: "corregir",
      message:
        "La DGII rechazó el comprobante. Revisa el motivo y emite uno corregido.",
    };
  }

  return {
    class: "INTERNAL",
    transient: false,
    action: "corregir",
    message: "Ocurrió un error al procesar el comprobante.",
  };
}

// ─── Reintentos ─────────────────────────────────────────────────────────────

/** Cuántas veces se reintenta algo transitorio antes de rendirse. */
export const MAX_INTENTOS = 6;

/** Primer respiro, en milisegundos. */
const BASE_MS = 30_000;

/** Tope: media hora. Más allá, esperar no aporta y solo retrasa el aviso. */
const TECHO_MS = 30 * 60_000;

/**
 * Cuánto esperar antes del siguiente intento.
 *
 * Exponencial **con ruido**. El ruido no es un adorno: sin él, cien
 * comprobantes que fallaron por el mismo corte de red reintentan todos en el
 * mismo instante, y vuelven a tumbar lo que se estaba recuperando. Con ruido se
 * reparten.
 *
 * `random` entra por parámetro para que esto sea puro y la prueba valga algo.
 */
export function nextRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const intento = Math.max(1, Math.trunc(attempt));
  const exponencial = Math.min(TECHO_MS, BASE_MS * 2 ** (intento - 1));
  // Ruido completo: entre la mitad y el total. Reparte de verdad, en vez de
  // mover todo el rebaño unos segundos.
  const minimo = exponencial / 2;
  return Math.round(minimo + random() * (exponencial - minimo));
}

/** ¿Seguimos intentando? */
export function shouldRetry(error: ClassifiedError, attempt: number): boolean {
  return error.transient && attempt < MAX_INTENTOS;
}

const ETIQUETAS: Record<ErrorClass, string> = {
  VALIDATION: "Documento inválido",
  AUTHENTICATION: "Sesión con DGII",
  NETWORK: "Problema de conexión",
  TIMEOUT: "Sin respuesta a tiempo",
  DGII_REJECTION: "Rechazado por DGII",
  CONFIGURATION: "Falta configuración",
  CERTIFICATE: "Certificado digital",
  INTERNAL: "Error interno",
};

export function errorClassLabel(clase: ErrorClass): string {
  return ETIQUETAS[clase];
}
