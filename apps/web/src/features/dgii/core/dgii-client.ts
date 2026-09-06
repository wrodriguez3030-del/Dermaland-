/**
 * Cliente DGII e-CF.
 *
 * - prepare*Request / prepareTestecfSubmission: PREVIEW (sin red, sin XML, sin secretos).
 * - requestSemilla / validarSemilla / recepcionEcf / consultarEstadoTrackId: primitivas
 *   HTTP que usan un TRANSPORTE INYECTABLE (mock en tests; real solo en modo live). NUNCA
 *   invocan `fetch` directamente — eso vive solo en dgii-http-transport.ts.
 * - executeDgiiSubmission: orquestador GATED. Default/non-live → DgiiSendDisabledError.
 *   Solo modo "live" con TODOS los gates + confirmación manual + transporte ejecuta el flujo.
 */
import { createHash } from "node:crypto";
import { DgiiSendDisabledError, type DgiiAmbienteTarget } from "./killswitches";
import { DgiiHttpError, type DgiiHttpTransport } from "./dgii-http-transport-types";
import {
  normalizeEstadoResponse,
  normalizeRecepcionResponse,
  seedHttpErrorMessage,
  type NormalizedDgiiResponse,
} from "./dgii-response-normalizer";
import {
  DGII_DEFAULT_BASE_URLS,
  type TransportPaths,
  DGII_PATHS,
  DGII_RECEPCION_PATH,
  type DgiiClientMode,
  type DgiiLiveSubmissionResult,
  type ExecuteDgiiSubmissionInput,
  type PrepareTestecfSubmissionInput,
  type PreparedDgiiRequest,
  type PreparedDgiiSubmission,
} from "./dgii-client-types";

function baseFor(ambiente: DgiiAmbienteTarget, override?: string | null): string {
  const base = override && override.trim() ? override.trim() : DGII_DEFAULT_BASE_URLS[ambiente];
  return base.replace(/\/+$/, "");
}

function endpointFor(ambiente: DgiiAmbienteTarget, override?: string | null): string {
  return baseFor(ambiente, override) + "/" + DGII_RECEPCION_PATH;
}

/** Arma el request DGII esperado SIN enviarlo. No incluye el XML ni secretos. */
export function prepareTestecfSubmission(input: PrepareTestecfSubmissionInput): PreparedDgiiSubmission {
  if (typeof input.signedXml !== "string" || input.signedXml.trim() === "") {
    throw new Error("Se requiere el XML firmado.");
  }
  const bytes = Buffer.byteLength(input.signedXml, "utf8");
  const xmlSha256 = createHash("sha256").update(input.signedXml, "utf8").digest("hex");
  return {
    method: "POST",
    endpointUrl: endpointFor(input.ambiente, input.baseUrlOverride),
    headersRedacted: { "Content-Type": "multipart/form-data", Authorization: "Bearer <redacted>" },
    multipartParts: [{ name: "xml", fileName: `${input.eNcf}.xml`, contentType: "text/xml", bytes }],
    contentLength: bytes,
    xmlSha256,
    eNcf: input.eNcf,
    tipoEcf: input.tipoEcf,
    ambiente: input.ambiente,
    executed: false,
  };
}

// ── Requests preparados (PREVIEW) — NO hacen fetch, NO tocan DGII ────────────
export function prepareSemillaRequest(ambiente: DgiiAmbienteTarget, override?: string | null): PreparedDgiiRequest {
  return { kind: "semilla", method: "GET", endpointUrl: `${baseFor(ambiente, override)}/${DGII_PATHS.semilla}`, headersRedacted: { Accept: "application/xml" }, executed: false };
}
export function prepareValidarSemillaRequest(ambiente: DgiiAmbienteTarget, override?: string | null): PreparedDgiiRequest {
  return { kind: "validar_semilla", method: "POST", endpointUrl: `${baseFor(ambiente, override)}/${DGII_PATHS.validarSemilla}`, headersRedacted: { "Content-Type": "multipart/form-data" }, executed: false };
}
export function prepareRecepcionEcfRequest(input: PrepareTestecfSubmissionInput): PreparedDgiiSubmission {
  return prepareTestecfSubmission(input);
}
export function prepareStatusTrackIdRequest(ambiente: DgiiAmbienteTarget, trackId: string, override?: string | null): PreparedDgiiRequest {
  return { kind: "estado", method: "GET", endpointUrl: `${baseFor(ambiente, override)}/${DGII_PATHS.estado}`, headersRedacted: { Authorization: "Bearer <redacted>" }, query: { trackId }, executed: false };
}

// ── Primitivas HTTP con transporte inyectable ───────────────────────────────
// v381 — `paths` opcional permite reusar estas primitivas con las rutas CerteCF
// verificadas (minúsculas) sin tocar el flujo testecf. Default = DGII_PATHS (testecf).
type TransportOpts = { transport: DgiiHttpTransport; baseUrl: string; timeoutMs: number; paths?: TransportPaths };

/** GET Semilla → XML de semilla. */
export async function requestSemilla(opts: TransportOpts): Promise<{ seedXml: string }> {
  const res = await opts.transport.request({ method: "GET", url: `${opts.baseUrl}/${opts.paths?.semilla ?? DGII_PATHS.semilla}`, headers: { Accept: "application/xml" }, timeoutMs: opts.timeoutMs, redactionLabel: "semilla" });
  if (res.status !== 200) throw new DgiiHttpError(seedHttpErrorMessage(res.status, "semilla", res.bodyText), "bad_status", res.status);
  if (!res.bodyText.trim() || !/<[^>]+>/.test(res.bodyText)) throw new DgiiHttpError(seedHttpErrorMessage(200, "semilla", res.bodyText), "bad_status", 200);
  return { seedXml: res.bodyText };
}

/** POST ValidarSemilla (semilla FIRMADA) → token bearer. Nunca loguea la semilla firmada. */
export async function validarSemilla(opts: TransportOpts & { signedSeedXml: string }): Promise<{ token: string }> {
  const form = new FormData();
  form.append("xml", new Blob([opts.signedSeedXml], { type: "text/xml" }), "seed.xml");
  const res = await opts.transport.request({ method: "POST", url: `${opts.baseUrl}/${opts.paths?.validarSemilla ?? DGII_PATHS.validarSemilla}`, body: form, timeoutMs: opts.timeoutMs, redactionLabel: "validarSemilla" });
  if (res.status !== 200) throw new DgiiHttpError(seedHttpErrorMessage(res.status, "validar_semilla", res.bodyText), "bad_status", res.status);
  const token = extractToken(res.bodyText);
  if (!token) throw new DgiiHttpError(seedHttpErrorMessage(200, "validar_semilla", res.bodyText), "bad_status", 200);
  return { token };
}

/**
 * v387 — Nombre de archivo OFICIAL DGII del multipart de recepción: **RNC + e-NCF + ".xml"**
 * (p.ej. `131561985E310000000001.xml`). El rechazo del E31 incluyó "longitud del nombre del
 * archivo no es válida" porque se enviaba solo `e-NCF.xml`. Saneado (solo dígitos/letras).
 */
export function buildDgiiXmlFilename(args: { rnc: string; encf: string }): string {
  const rnc = (args.rnc ?? "").replace(/[^0-9A-Za-z]/g, "");
  const encf = (args.encf ?? "").replace(/[^0-9A-Za-z]/g, "");
  return `${rnc}${encf}.xml`;
}

/** POST Recepción e-CF (multipart con XML firmado) → respuesta normalizada. `rncEmisor` (v387)
 *  produce el nombre oficial RNC+e-NCF.xml; sin él cae al legacy `e-NCF.xml` (compat). */
export async function recepcionEcf(opts: TransportOpts & { token: string; signedXml: string; eNcf: string; rncEmisor?: string }): Promise<NormalizedDgiiResponse> {
  const form = new FormData();
  const filename = opts.rncEmisor ? buildDgiiXmlFilename({ rnc: opts.rncEmisor, encf: opts.eNcf }) : `${opts.eNcf}.xml`;
  form.append("xml", new Blob([opts.signedXml], { type: "text/xml" }), filename);
  const res = await opts.transport.request({ method: "POST", url: `${opts.baseUrl}/${opts.paths?.recepcion ?? DGII_RECEPCION_PATH}`, headers: { Authorization: `Bearer ${opts.token}` }, body: form, timeoutMs: opts.timeoutMs, redactionLabel: "recepcion" });
  return normalizeRecepcionResponse(res);
}

/** GET estado por TrackId → respuesta normalizada. */
export async function consultarEstadoTrackId(opts: TransportOpts & { token: string; trackId: string }): Promise<NormalizedDgiiResponse> {
  const res = await opts.transport.request({ method: "GET", url: `${opts.baseUrl}/${opts.paths?.estado ?? DGII_PATHS.estado}?trackid=${encodeURIComponent(opts.trackId)}`, headers: { Authorization: `Bearer ${opts.token}` }, timeoutMs: opts.timeoutMs, redactionLabel: "estado" });
  return normalizeEstadoResponse(res, opts.trackId);
}

/** Extrae el JWT de la respuesta de ValidarSemilla (JSON o XML). Exportado para reuso CerteCF. */
export function extractToken(body: string): string | null {
  const t = body.trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const v = j["token"] ?? j["Token"] ?? j["access_token"];
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {
      /**
       * v624 — El cuerpo empezaba por `{` pero no era JSON válido. Es un caso ESPERADO:
       * la DGII responde JSON en unos endpoints y XML en otros, y algunos devuelven un
       * texto que sólo lo parece. Abajo se intenta con la forma XML, que es el otro camino
       * legítimo — por eso callarse aquí no pierde nada.
       *
       * Decía «fallthrough», que nombra el mecanismo y no lo que se ignora.
       */
    }
  }
  const m = body.match(/<\s*token\s*>\s*([^<]+?)\s*<\s*\/\s*token\s*>/i) || body.match(/"token"\s*:\s*"([^"]+)"/i);
  return m ? m[1]!.trim() : null;
}

/**
 * Orquestador GATED de envío real. NUNCA hace fetch directo (usa el transporte).
 * Default / non-live → DgiiSendDisabledError. Modo "live" exige TODOS los gates +
 * confirmación manual + transporte + XML firmado + firmador de semilla.
 */
export async function executeDgiiSubmission(input: ExecuteDgiiSubmissionInput): Promise<DgiiLiveSubmissionResult> {
  const mode: DgiiClientMode = input.mode ?? "disabled";
  if (mode !== "live") {
    throw new DgiiSendDisabledError(mode === "future-live" ? "Envío real aún no habilitado (future-live)." : "Envío DGII deshabilitado por killswitch.");
  }
  // v511 — Se retiró `if (ambiente !== "testecf") throw "Solo testecf permitido en esta
  // fase."`. Era el último bloqueo de la fase de certificación: vivía en el transporte y por
  // eso no estaba entre los seis que v501 levantó. Con el negocio en `ambiente = ecf`, este
  // throw hacía imposible transmitir aunque todos los gates estuvieran abiertos.
  //
  // Lo que protege ahora son los gates de abajo, que NO se relajaron: killswitch de entorno
  // DEL AMBIENTE que se está usando, killswitch por tenant, habilitación y confirmación.
  const g = input.gates;
  if (!g?.envSendEnabled) throw new DgiiSendDisabledError(`Killswitch de entorno para ${input.prepared.ambiente} apagado.`);
  if (!g.tenantRealSendEnabled) throw new DgiiSendDisabledError("dgii_enabled_real_send del tenant apagado.");
  if (!g.readyForTestecf) throw new DgiiSendDisabledError("La habilitación no está en un estado que permita enviar.");
  if (input.manualConfirmation !== true) throw new DgiiSendDisabledError("Falta confirmación manual.");
  if (!input.transport) throw new DgiiSendDisabledError("Falta el transporte HTTP.");
  if (!input.signedXml || !input.signSeed) throw new DgiiSendDisabledError("Falta XML firmado o firmador de semilla.");

  const baseUrl = input.baseUrl ?? baseFor(input.prepared.ambiente);
  const timeoutMs = input.timeoutMs ?? 15_000;
  const t = { transport: input.transport, baseUrl, timeoutMs, paths: input.paths };

  // v531 — La autenticación y la entrega pueden vivir en HOSTS DISTINTOS.
  //
  // El resumen RFCE se recibe en `fc.dgii.gov.do`; la semilla y su validación, no. Cuando
  // v511 enrutó el resumen cambió `baseUrl` entero, así que el handshake se iba también a
  // `fc` — donde no hay servicio de autenticación— y el envío moría antes de pedir el token.
  // Se veía como «sin respuesta a tiempo» y en realidad fallaba en un segundo.
  const seed = await requestSemilla(t);
  const signedSeed = await input.signSeed(seed.seedXml);
  const { token } = await validarSemilla({ ...t, signedSeedXml: signedSeed });
  const rec = await recepcionEcf({
    ...t,
    // Solo la entrega cambia de host. Sin `recepcionBaseUrl`, todo sigue como antes.
    baseUrl: input.recepcionBaseUrl ?? baseUrl,
    token,
    signedXml: input.signedXml,
    eNcf: input.prepared.eNcf,
    // v534 — Sin esto el archivo viaja con el nombre legacy, que DGII no espera.
    rncEmisor: input.rncEmisor,
  });
  // v584 — El cuerpo real viaja hasta quien lo persiste, en vez de perderse aquí.
  return { executed: true, trackId: rec.trackId, status: rec.status, httpStatus: rec.httpStatus, responseSummary: rec.message, rawBody: rec.rawBody };
}
