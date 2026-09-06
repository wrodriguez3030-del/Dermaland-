/**
 * Tipos del cliente DGII (Fase 8 — dry-run/stub). NO ejecuta red.
 */
import type { DgiiAmbienteTarget } from "./killswitches";
import type { DgiiHttpTransport } from "./dgii-http-transport-types";
import type { NormalizedDgiiStatus } from "./dgii-response-normalizer";

/**
 * URLs base OFICIALES por ambiente. SOLO para previsualización del endpoint;
 * en Fase 8 NUNCA se invocan (no hay fetch). Override solo por env en fases reales.
 */
export const DGII_DEFAULT_BASE_URLS: Record<DgiiAmbienteTarget, string> = {
  testecf: "https://ecf.dgii.gov.do/testecf/",
  certecf: "https://ecf.dgii.gov.do/certecf/",
  ecf: "https://ecf.dgii.gov.do/ecf/",
};

/**
 * Path de recepción e-CF (multipart). Relativo a la base del ambiente.
 * VERIFIED (G2B3): `https://ecf.dgii.gov.do/{ambiente}/recepcion/api/facturaselectronicas`
 * (POST, Bearer). Fuente: Descripción Técnica FE v1.6 + ayuda DGII "URL recepción ecf".
 */
export const DGII_RECEPCION_PATH = "recepcion/api/facturaselectronicas";

/**
 * Paths por operación (relativos a la base del ambiente). Solo PREVIEW/uso interno.
 * Los 4 VERIFIED contra documentación oficial DGII (G2B2/G2B3). Ver
 * docs/dgii/generated/ENDPOINTS_VERIFIED_G2B.md.
 */
export const DGII_PATHS = {
  semilla: "Autenticacion/api/Autenticacion/Semilla",
  validarSemilla: "Autenticacion/api/Autenticacion/ValidarSemilla",
  recepcion: DGII_RECEPCION_PATH,
  estado: "consultaresultado/api/consultas/estado",
  // v335 — VERIFICADOS contra "Descripción Técnica Servicios DGII" vigente
  // (bitácora 02-01-2026, leída 2026-07-09). DOCUMENTALES: ningún flujo los
  // llama todavía (aprobación comercial saliente y anulación de rangos son
  // fases posteriores, gateadas por killswitch como todo envío).
  aprobacionComercial: "aprobacioncomercial/api/aprobacioncomercial",
  anulacionRangos: "anulacionrangos/api/operaciones/anularrango",
} as const;

/**
 * v335 — Host OFICIAL para RFCE (Resumen Factura de Consumo < RD$250k): DGII lo
 * recibe en `fc.dgii.gov.do` (NO en ecf.dgii.gov.do). Documental — el envío de
 * RFCE real no está implementado; cuando se implemente debe usar este host.
 * Fuente: Descripción Técnica Servicios DGII (POST {amb}/recepcionfc/api/recepcion/ecf).
 */
export const DGII_FC_BASE_URLS: Record<DgiiAmbienteTarget, string> = {
  testecf: "https://fc.dgii.gov.do/testecf/",
  certecf: "https://fc.dgii.gov.do/certecf/",
  ecf: "https://fc.dgii.gov.do/ecf/",
};
export const DGII_RECEPCION_FC_PATH = "recepcionfc/api/recepcion/ecf";

/** v531 — Rutas por operación (relativas a la base). Vivía en `dgii-client.ts`; se mudó acá
 * porque el input de `executeDgiiSubmission` también la necesita y este módulo no importa a
 * nadie. Una sola definición. */
export type TransportPaths = { semilla?: string; validarSemilla?: string; recepcion?: string; estado?: string };

export type DgiiRequestKind = "semilla" | "validar_semilla" | "recepcion" | "estado";

/** Request DGII preparado (auth/estado) — sin body, sin XML, sin secretos. */
export type PreparedDgiiRequest = {
  kind: DgiiRequestKind;
  method: "GET" | "POST";
  endpointUrl: string;
  headersRedacted: Record<string, string>;
  query?: Record<string, string>;
  /** Marca que NO fue ejecutado. */
  executed: false;
};

export type PrepareTestecfSubmissionInput = {
  signedXml: string;
  tipoEcf: string;
  eNcf: string;
  ambiente: DgiiAmbienteTarget;
  /** Override de base URL (no usado en Fase 8). */
  baseUrlOverride?: string | null;
};

export type MultipartPartMeta = {
  name: string;
  fileName: string;
  contentType: string;
  /** Tamaño en bytes del contenido de la parte (no su contenido). */
  bytes: number;
};

/** Representación del request DGII preparado — sin el XML ni secretos. */
export type PreparedDgiiSubmission = {
  method: "POST";
  endpointUrl: string;
  /** Headers con valores sensibles redactados. */
  headersRedacted: Record<string, string>;
  multipartParts: MultipartPartMeta[];
  contentLength: number;
  xmlSha256: string;
  eNcf: string;
  tipoEcf: string;
  ambiente: DgiiAmbienteTarget;
  /** Marca que NO fue enviado. */
  executed: false;
};

/**
 * Modo del cliente DGII:
 * - "disabled" (default): SIEMPRE lanza DgiiSendDisabledError.
 * - "future-live": reservado; lanza DgiiSendDisabledError (envío real no habilitado).
 * - "live": ejecuta el flujo HTTP real, SOLO con todos los gates + transporte inyectado.
 *           En la suite normal nunca se usa modo live con transporte real.
 */
export type DgiiClientMode = "disabled" | "future-live" | "live";

/** Gates de envío real (computados por la capa de servicio desde env + DB). */
export type DgiiSubmissionGates = {
  envSendEnabled: boolean;        // DGII_TESTECF_SEND_ENABLED
  tenantRealSendEnabled: boolean; // dgii_settings.dgii_enabled_real_send
  readyForTestecf: boolean;       // habilitación Fase 9
};

export type ExecuteDgiiSubmissionInput = {
  /** Default "disabled". Solo "live" ejecuta red (con gates). */
  mode?: DgiiClientMode;
  prepared: PreparedDgiiSubmission;
  /** XML firmado a transmitir (no se loguea completo). */
  signedXml?: string;
  /** Transporte HTTP inyectable (mock en tests; real en producción). */
  transport?: DgiiHttpTransport;
  baseUrl?: string;
  /**
   * v531 — Destino SOLO de la recepción, cuando no está en el mismo host que el resto.
   *
   * Es el caso del resumen RFCE: DGII lo recibe en `fc.dgii.gov.do` pero la autenticación
   * —semilla y validación— vive en `ecf.dgii.gov.do`. Antes se cambiaba `baseUrl` entero y
   * el handshake se iba también a `fc`, donde ese servicio no existe: fallaba de entrada,
   * en un segundo, sin token y sin haber enviado nada.
   *
   * Medido contra DGII (2026-08-06): `ecf.dgii.gov.do/ecf/…/Semilla` → HTTP 200;
   * `fc.dgii.gov.do/ecf/…/Semilla` → no conecta; `fc.dgii.gov.do/ecf/recepcionfc/…` → 411,
   * o sea existe y solo pide el cuerpo.
   */
  recepcionBaseUrl?: string;
  /**
   * v531 — Rutas por operación, para cuando una difiere de la estándar.
   *
   * `submission-service` ya venía pasando `paths: { recepcion: recepcionfc/... }` para el
   * resumen RFCE… y **se ignoraba en silencio**: el campo no existía en este tipo y el
   * cliente nunca lo trasladaba al transporte, así que la entrega usaba siempre la ruta de
   * recepción normal. Dos errores en el mismo camino, y ninguno se veía.
   */
  paths?: TransportPaths;
  /**
   * v534 — RNC del emisor, para el NOMBRE del archivo que se sube.
   *
   * DGII espera `{RNC}{e-NCF}.xml`. `recepcionEcf` lo arma desde v387 y, sin este dato, cae
   * a un nombre legacy (`{e-NCF}.xml`). El camino de la certificación —el que DGII aceptó
   * 165 veces— siempre lo pasó; el de producción nunca, porque `executeDgiiSubmission` no
   * tenía por dónde recibirlo. Se veía recién al primer envío productivo, después de
   * resolver la autenticación.
   */
  rncEmisor?: string;
  timeoutMs?: number;
  /** Firma la semilla devuelta por DGII (usa la private key, server-only). */
  signSeed?: (seedXml: string) => Promise<string> | string;
  /** Debe ser true para envío real (confirmación manual). */
  manualConfirmation?: boolean;
  gates?: DgiiSubmissionGates;
};

/** Resultado de un envío real (ejecutado). NUNCA incluye XML/token. */
export type DgiiLiveSubmissionResult = {
  executed: true;
  trackId: string | null;
  status: NormalizedDgiiStatus;
  httpStatus: number;
  responseSummary: string;
  /** v584 — El cuerpo tal cual lo mandó la DGII, para persistirlo como prueba. */
  rawBody?: string;
};

// ── Stubs de auth/estado (no-op en Fase 8) ──────────────────────────────────
export type SemillaResponse = { seed: string; expiresAt: string };
export type ValidarSemillaResponse = { token: string; expiresAt: string };
export type TrackIdStatus = {
  trackId: string;
  status: "submitted" | "in_process" | "accepted" | "accepted_conditional" | "rejected" | "error";
  message?: string;
};
