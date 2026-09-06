/**
 * Normaliza respuestas HTTP/text/XML/JSON de DGII a estados internos.
 * NUNCA incluye el body completo en el mensaje (se sanea/trunca).
 */
import type { DgiiHttpResponse } from "./dgii-http-transport-types";

export type NormalizedDgiiStatus =
  | "submitted"
  | "in_process"
  | "accepted"
  | "accepted_conditional"
  | "rejected"
  | "error";

export type NormalizedDgiiResponse = {
  status: NormalizedDgiiStatus;
  httpStatus: number;
  trackId: string | null;
  code: string | null;
  /** Mensaje corto saneado (sin body completo, sin secretos). */
  message: string;
  /** v386 — mensajes de validación de DGII (rechazo), saneados. Antes se descartaban:
   *  el rechazo quedaba solo como "Rechazado" sin motivo. Backward-compatible (default []). */
  messages: string[];
  /**
   * v584 — El cuerpo TAL CUAL lo mandó la DGII, para persistirlo como prueba.
   *
   * Hasta ahora se guardaba en storage un `<DgiiResponse>…</DgiiResponse>` que el propio
   * `submission-service` fabricaba a partir de estos campos ya normalizados: un resumen
   * nuestro con nombre de prueba documental. El día que haya que justificar algo ante la
   * DGII, ese archivo no vale nada.
   *
   * Ya viene recortado por el transporte (`DGII_MAX_RESPONSE_BYTES`) y sin cabeceras: el
   * token va en `Authorization`, que nunca entra aquí. NO se registra en logs — sólo se
   * escribe en el almacén privado.
   */
  rawBody?: string;
};

const MAX_MSG = 200;
const MAX_MESSAGES = 40;
const sanitize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_MSG);

/**
 * v386 — Extrae RECURSIVAMENTE los mensajes de validación de DGII (motivo del rechazo)
 * de JSON o XML. DGII devuelve el detalle en `mensajes`/`mensajesError`/`errores`/
 * `validaciones`/`detalle`/`resultados` (arrays de string u objetos con `valor`/`mensaje`/
 * `descripcion`/`codigo`). Nunca incluye el body completo ni secretos; sanea y acota.
 */
export function extractDgiiMessages(body: string): string[] {
  const out: string[] = [];
  const push = (s: unknown, code?: unknown) => {
    if (out.length >= MAX_MESSAGES) return;
    const text = typeof s === "string" ? s : typeof s === "number" ? String(s) : "";
    if (!text.trim()) return;
    const prefix = code != null && code !== "" ? `[${String(code).slice(0, 20)}] ` : "";
    const msg = sanitize(`${prefix}${text}`);
    if (msg && !out.includes(msg)) out.push(msg);
  };
  const json = tryJson(body);
  if (json) {
    const MSG_KEYS = ["mensajes", "Mensajes", "mensajesError", "MensajesError", "errores", "Errores", "validaciones", "validationMessages", "detalle", "Detalle", "resultados", "innerErrors"];
    const TEXT_KEYS = ["valor", "Valor", "mensaje", "Mensaje", "descripcion", "Descripcion", "message", "detalle", "error"];
    const CODE_KEYS = ["codigo", "Codigo", "code", "codigoError"];
    const walk = (node: unknown, depth: number) => {
      if (out.length >= MAX_MESSAGES || depth > 6 || node == null) return;
      if (Array.isArray(node)) { for (const it of node) walk(it, depth + 1); return; }
      if (typeof node === "string" || typeof node === "number") { push(node); return; }
      if (typeof node === "object") {
        const o = node as Record<string, unknown>;
        const text = TEXT_KEYS.map((k) => o[k]).find((v) => typeof v === "string" || typeof v === "number");
        const code = CODE_KEYS.map((k) => o[k]).find((v) => v != null);
        if (text != null) push(text, code);
        for (const k of MSG_KEYS) if (o[k] != null) walk(o[k], depth + 1);
      }
    };
    for (const k of MSG_KEYS) if (json[k] != null) walk(json[k], 0);
    // Mensaje principal top-level (si existe y no está ya).
    for (const k of ["mensaje", "Mensaje", "message"]) { const v = json[k]; if (typeof v === "string") push(v); }
    return out;
  }
  // XML: <mensaje>…</mensaje> / <Mensaje>…</Mensaje> / <valor>…</valor>.
  const re = /<\s*(mensaje|Mensaje|valor|Valor|descripcion|Descripcion)\s*>\s*([^<]+?)\s*<\s*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) && out.length < MAX_MESSAGES) push(m[2]);
  return out;
}

function extractCodigo(body: string): string | null {
  const json = tryJson(body);
  if (json) {
    for (const k of ["codigo", "Codigo", "code", "codigoError"]) {
      const v = json[k];
      if (typeof v === "string" || typeof v === "number") return String(v).slice(0, 20);
    }
  }
  const m = body.match(/<\s*codigo\s*>\s*([^<]+?)\s*<\s*\/\s*codigo\s*>/i) || body.match(/"codigo"\s*:\s*"?([^",}]+)"?/i);
  return m ? m[1]!.trim().slice(0, 20) : null;
}

/** Extrae trackId de JSON o XML de forma tolerante. */
function extractTrackId(body: string): string | null {
  const json = tryJson(body);
  if (json) {
    const v = json["trackId"] ?? json["TrackId"] ?? json["trackID"] ?? json["track_id"];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const m = body.match(/<\s*trackId\s*>\s*([^<]+?)\s*<\s*\/\s*trackId\s*>/i) || body.match(/"trackId"\s*:\s*"([^"]+)"/i);
  return m ? m[1]!.trim() : null;
}

function extractEstado(body: string): string | null {
  const json = tryJson(body);
  if (json) {
    const v = json["estado"] ?? json["Estado"] ?? json["status"];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const m = body.match(/<\s*estado\s*>\s*([^<]+?)\s*<\s*\/\s*estado\s*>/i) || body.match(/"estado"\s*:\s*"([^"]+)"/i);
  return m ? m[1]!.trim() : null;
}

function tryJson(body: string): Record<string, unknown> | null {
  const t = body.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mapEstadoToStatus(estado: string | null): NormalizedDgiiStatus {
  const e = (estado ?? "").toLowerCase();

  /**
   * v582b — El orden importa, y v582 lo escribió en el comentario sin ponerlo en el código.
   *
   * Decía «el RECHAZO se comprueba antes que la aceptación, y la NEGACIÓN antes que todo»
   * mientras la rama `condicional` seguía corriendo la primera. Resultado comprobado
   * ejecutando: «Rechazado. No cumple la aceptacion condicional» salía
   * `accepted_conditional`, que es TERMINAL — un verde irrecuperable sobre un rechazo.
   *
   * Ahora el orden es el que dice: primero la negación, luego el rechazo, y sólo después
   * las aceptaciones. Un texto que menciona un rechazo nunca acaba en una de ellas.
   */
  if (/\bno\s+(fue\s+|ha\s+sido\s+)?(aceptad|aprobad)/.test(e)) return "rejected";
  if (/rechazad|rejected|denegad/.test(e)) return "rejected";
  if (/aceptado\s*condicional|accepted_conditional|condicional/.test(e)) return "accepted_conditional";
  // v414 — `aprobad` (Aprobado/Aprobada) también es aceptación: la recepción e-CF puede devolver
  // "Aprobado" como texto de estado (paridad con el veredicto ACECF, que ya lo reconoce).
  if (/aceptado|accepted|aprobad/.test(e)) return "accepted";
  if (/en\s*proceso|in_process|procesando|recibido/.test(e)) return "in_process";
  return "in_process";
}

/**
 * v414 — Fallback DEFENSIVO por CÓDIGO numérico estructurado del estado de DGII (ConsultaResultado):
 * `1`→aceptado, `2`→rechazado, `0`/`3`→en proceso. Tolera ceros a la izquierda ("01"→"1"). Devuelve
 * null si el código no es un veredicto reconocible (no opina; se cae al texto). NO clasifica nada como
 * aceptado por defecto.
 */
function statusFromCodigo(codigo: string | null): NormalizedDgiiStatus | null {
  if (codigo == null) return null;
  const c = codigo.trim().replace(/^0+/, "") || "0"; // "01"→"1"; "0"/"00"→"0"
  if (c === "1") return "accepted";
  if (c === "2") return "rejected";
  if (c === "0" || c === "3") return "in_process";
  return null; // código no reconocido → sin opinión
}

/**
 * v414 — Resuelve el estado de una ConsultaResultado combinando el CÓDIGO estructurado y el texto libre.
 * Reglas (en este orden de precedencia):
 *  1. Seguridad: cualquier señal de RECHAZO (código 2 o texto "Rechazado") gana — jamás clasificar un
 *     rechazo como aceptado.
 *  2. Nunca DEGRADAR un veredicto terminal del texto (accepted/accepted_conditional) a "en proceso" por
 *     un código no terminal.
 *  3. Con el texto no terminal (en proceso) o ausente, el código estructurado (1/2) tiene prioridad y
 *     puede elevar a un veredicto terminal; si tampoco hay código, "en proceso".
 */
function resolveConsultaStatus(
  byText: NormalizedDgiiStatus | null,
  byCode: NormalizedDgiiStatus | null,
): NormalizedDgiiStatus {
  // Rechazo (por cualquier vía) manda: nunca aceptar un rechazo.
  if (byText === "rejected" || byCode === "rejected") return "rejected";
  // Sin texto → el código estructurado manda (o "en proceso" si tampoco hay código reconocible).
  if (byText == null) return byCode ?? "in_process";
  // Texto terminal de aceptación → respetarlo (nunca degradar por un código no terminal).
  if (byText === "accepted" || byText === "accepted_conditional") return byText;
  // Texto no terminal (en proceso): el código estructurado puede elevarlo (accepted); si no, "en proceso".
  return byCode ?? byText;
}

/**
 * v581 — ¿La DGII llegó a EVALUAR el documento, o el 400 viene de otro sitio?
 *
 * Cuando la DGII rechaza, DICE POR QUÉ: los dos rechazos reales de este negocio llegaron
 * con su código y su texto ([176] IndicadorMontoGravado, [260] MontoITBISRetenido). Un
 * proxy, un WAF o un multipart mal formado devuelven 400 pelado.
 *
 * Sólo se usa en el camino de RECEPCIÓN de e-CF, que es donde un rechazo cuesta un número
 * autorizado. La aprobación comercial (ACECF) no consume ninguno y conserva su lectura de
 * siempre.
 */
function hayVeredictoDgii(bodyText: string, messages: string[]): boolean {
  return messages.length > 0 || extractCodigo(bodyText) != null || extractEstado(bodyText) != null;
}

function statusForHttpError(http: number): { status: NormalizedDgiiStatus; message: string } {
  switch (http) {
    case 400: return { status: "rejected", message: "DGII 400: esquema/validación rechazada." };
    case 401: return { status: "error", message: "DGII 401: token inválido/expirado." };
    case 403: return { status: "error", message: "DGII 403: contribuyente no autorizado." };
    case 404: return { status: "error", message: "DGII 404: recurso/trackId no encontrado." };
    case 429: return { status: "error", message: "DGII 429: rate limit." };
    default:
      if (http >= 500) return { status: "error", message: `DGII ${http}: servicio no disponible.` };
      return { status: "error", message: `DGII ${http}: respuesta inesperada.` };
  }
}

/**
 * Mensaje seguro para errores de Semilla/ValidarSemilla. NUNCA incluye la semilla
 * firmada ni el token. `kind` distingue el paso para un mensaje claro.
 */
/**
 * v532 — Lo que DGII contestó, en sus palabras.
 *
 * DGII SÍ explica por qué rechaza, y con precisión. Comprobado el 2026-08-06 contra
 * producción: con un XML incompleto responde «La estructura del archivo XML no es válido…
 * verificar el XSD correspondiente»; con un certificado que no acepta, «Tipo de certificado
 * no admitido». Son dos problemas que se resuelven de formas completamente distintas.
 *
 * Hasta acá tirábamos ese cuerpo y lo reemplazábamos por «400 (semilla/firma inválida)» —
 * un texto nuestro que mezcla las dos causas y no señala ninguna. El primer envío real del
 * negocio se fue en eso.
 *
 * Se recorta y NUNCA lleva la semilla firmada ni el token: sólo el mensaje de error.
 */
function detalleDeDgii(bodyText?: string): string {
  const cuerpo = (bodyText ?? "").trim();
  if (!cuerpo || /<html/i.test(cuerpo)) return "";
  try {
    const j = JSON.parse(cuerpo);
    const partes = [
      typeof j === "string" ? j : null,
      typeof j?.mensaje === "string" ? j.mensaje : null,
      Array.isArray(j?.errores) ? j.errores.filter((x: unknown) => typeof x === "string").join(" · ") : null,
    ].filter(Boolean);
    if (partes.length) return partes.join(" — ").slice(0, 300);
  } catch { /* no era JSON: se usa el texto crudo */ }
  return cuerpo.replace(/\s+/g, " ").slice(0, 300);
}

export function seedHttpErrorMessage(
  status: number,
  kind: "semilla" | "validar_semilla",
  bodyText?: string,
): string {
  const paso = kind === "semilla" ? "Semilla" : "ValidarSemilla";
  const dgii = detalleDeDgii(bodyText);
  const conDetalle = (base: string) => (dgii ? `${base} DGII dice: ${dgii}` : base);
  if (status === 0) return `${paso}: timeout.`;
  if (status === 200) return `${paso}: respuesta 200 inesperada (sin contenido válido).`;
  if (status === 400) return conDetalle(`${paso}: DGII rechazó la petición (400).`);
  if (status === 401) return conDetalle(`${paso}: certificado o token no autorizado (401).`);
  if (status === 403) return conDetalle(`${paso}: contribuyente no autorizado (403).`);
  if (status === 429) return `${paso}: 429 (rate limit).`;
  if (status >= 500) return conDetalle(`${paso}: el servicio de DGII no está disponible (${status}).`);
  return conDetalle(`${paso}: HTTP ${status}.`);
}

/** Respuesta de recepción e-CF (multipart). 200+trackId → submitted. */
export function normalizeRecepcionResponse(http: DgiiHttpResponse): NormalizedDgiiResponse {
  const messages = extractDgiiMessages(http.bodyText);
  if (http.status === 200) {
    const trackId = extractTrackId(http.bodyText);
    if (trackId) return { status: "submitted", httpStatus: 200, trackId, code: extractCodigo(http.bodyText) ?? "0", message: "Recibido (TrackId asignado).", messages, rawBody: http.bodyText };
    // 200 sin trackId: puede traer estado directo o ser inesperado.
    const estado = extractEstado(http.bodyText);
    if (estado) {
      /**
       * v582b — El código sólo puede EMPEORAR el veredicto, nunca mejorarlo.
       *
       * v582 enrutó esto por `resolveConsultaStatus` para que un rechazo por código ganara
       * sobre un texto ambiguo. Cerró esa dirección y abrió la contraria, que es la cara:
       * esa función también deja al código ELEVAR un texto no terminal a `accepted`, y
       * comprobado ejecutando, `{estado:"Recibido", codigo:1}` quedaba aceptado y con su
       * `accepted_at` — sin vuelta atrás, porque `accepted` no tiene transiciones de salida.
       *
       * La regla del ascenso se escribió para el camino de CONSULTA, donde `codigo` es un
       * ConsultaResultado y significa un veredicto. En recepción esa misma clave la
       * rellenan otros payloads, así que aquí sólo se escucha en la dirección segura.
       */
      const codigo = extractCodigo(http.bodyText);
      const porTexto = mapEstadoToStatus(estado);
      const porCodigo = statusFromCodigo(codigo);
      return {
        status: porCodigo === "rejected" ? "rejected" : porTexto,
        httpStatus: 200,
        trackId: null,
        code: codigo,
        message: sanitize(estado),
        messages,
        rawBody: http.bodyText,
      };
    }
    return { status: "error", httpStatus: 200, trackId: null, code: null, message: "200 sin TrackId ni estado.", messages, rawBody: http.bodyText };
  }
  const e = statusForHttpError(http.status);
  /**
   * v581 — Un 400 pelado NO quema el comprobante.
   *
   * Mientras esto vivía sólo en la respuesta normalizada era una etiqueta; desde v577 se
   * escribe en `electronic_invoices.status`, y `rejected` es TERMINAL: no se reenvía, deja
   * de congelar los pagos de la venta, y la pantalla le dice al dueño que su número ya se
   * consumió y que emita otro. Un proxy, un WAF o un multipart mal formado devuelven 400
   * sin que la DGII haya visto el documento, y sin TrackId no hay forma de comprobarlo
   * después: se habría quemado un número autorizado que no se devuelve, por un error de
   * transporte.
   *
   * Con el detalle de la DGII delante, el rechazo se lee como siempre. Sin él pasa a
   * `error`, que `estadoTrasEnvio` deja en `submitted` y el cierre de caja vuelve a
   * intentar.
   */
  if (e.status === "rejected" && !hayVeredictoDgii(http.bodyText, messages)) {
    return {
      status: "error",
      httpStatus: http.status,
      trackId: null,
      code: extractCodigo(http.bodyText) ?? String(http.status),
      message: `DGII ${http.status} sin detalle: no se pudo confirmar que la DGII evaluara el comprobante.`,
      messages,
      rawBody: http.bodyText,
    };
  }
  return { status: e.status, httpStatus: http.status, trackId: null, code: extractCodigo(http.bodyText) ?? String(http.status), message: e.message, messages, rawBody: http.bodyText };
}

/** Respuesta de consulta de estado por TrackId. */
export function normalizeEstadoResponse(http: DgiiHttpResponse, trackId: string | null): NormalizedDgiiResponse {
  const messages = extractDgiiMessages(http.bodyText);
  if (http.status === 200) {
    const estado = extractEstado(http.bodyText);
    const codigo = extractCodigo(http.bodyText);
    // v414 — el estado terminal prioriza el CÓDIGO estructurado (1/2), con fallback por código cuando falta
    // el texto; nunca clasifica un rechazo como aceptado ni degrada un accepted/rejected del texto.
    const status = resolveConsultaStatus(estado ? mapEstadoToStatus(estado) : null, statusFromCodigo(codigo));
    // v615 — El cuerpo, tal cual. Acá llega el veredicto de todo lo que no es RFCE, y era
    // el único de los tres caminos que no lo conservaba: la prueba que más falta hace.
    return { status, httpStatus: 200, trackId: extractTrackId(http.bodyText) ?? trackId, code: codigo, message: estado ? sanitize(estado) : "Estado consultado.", messages, rawBody: http.bodyText };
  }
  const e = statusForHttpError(http.status);
  // Un error con su cuerpo explica el porqué; tirarlo deja el rechazo sin motivo.
  return { status: e.status, httpStatus: http.status, trackId, code: extractCodigo(http.bodyText) ?? String(http.status), message: e.message, messages, rawBody: http.bodyText };
}

/**
 * v405 — Normaliza la respuesta SÍNCRONA de Aprobación Comercial (ACECF). A diferencia de la recepción
 * e-CF (async con TrackId + estado "En Proceso"), el veredicto ACECF lo da el CÓDIGO en la misma respuesta:
 * `codigo=1` = Aprobada/ACEPTADA, `codigo=2` = Rechazada. Sin TrackId. El bug del incidente: la respuesta
 * traía código "01" + "Aprobacion Comercial Aprobada", pero `mapEstadoToStatus` solo reconoce "aceptado"
 * (no "aprobada") → caía al default `in_process`, dejando el caso en "sent"/processing y parando el runner.
 */
export function normalizeAcecfResponse(http: DgiiHttpResponse): NormalizedDgiiResponse {
  const messages = extractDgiiMessages(http.bodyText);
  const codigo = extractCodigo(http.bodyText);
  const estado = extractEstado(http.bodyText);
  const detail = estado ?? messages[0] ?? "";
  if (http.status === 200) {
    const c = (codigo ?? "").replace(/^0+/, ""); // "01" → "1"
    /**
     * v582b — El rechazo primero, y la negación antes que nada.
     *
     * v582 arregló la lectura de negaciones en `mapEstadoToStatus` y dejó intacto este
     * lector paralelo, 220 líneas más abajo del mismo archivo. Comprobado ejecutando:
     * `{codigo:"2", estado:"Aprobacion Comercial No Aprobada"}` devolvía «accepted»,
     * porque `/aprobad/` casaba con «No Aprobada» y su rama corría antes que la del
     * código 2. Un rechazo explícito perdía contra su propia negación.
     */
    const niega = /\bno\s+(fue\s+|ha\s+sido\s+)?(aceptad|aprobad)/i.test(detail);
    if (c === "2" || niega || /rechazad|rejected|denegad/i.test(detail)) {
      return { status: "rejected", httpStatus: 200, trackId: null, code: codigo, message: detail ? sanitize(detail) : "Aprobación comercial rechazada.", messages, rawBody: http.bodyText };
    }
    // Aceptada: código 1, o texto que indique aprobación/aceptación comercial.
    if (c === "1" || /aprobad|aceptad|accepted/i.test(detail)) {
      return { status: "accepted", httpStatus: 200, trackId: null, code: codigo, message: detail ? sanitize(detail) : "Aprobación comercial aceptada.", messages, rawBody: http.bodyText };
    }
    // 200 sin veredicto claro → incierto (no reenviar ciegamente; consultar/confirmar).
    return { status: "error", httpStatus: 200, trackId: null, code: codigo, message: detail ? sanitize(detail) : "Respuesta ACECF sin veredicto.", messages, rawBody: http.bodyText };
  }
  const e = statusForHttpError(http.status);
  return { status: e.status, httpStatus: http.status, trackId: null, code: codigo ?? String(http.status), message: e.message, messages, rawBody: http.bodyText };
}
