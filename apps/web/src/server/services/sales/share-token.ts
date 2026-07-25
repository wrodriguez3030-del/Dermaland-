import crypto from "node:crypto";

/**
 * Token firmado para compartir un documento de venta sin sesión.
 *
 * El enlace público (`/factura/[token]` y `/api/proformas/[id]/pdf?t=<token>`)
 * lo autoriza este token, no la sesión. Codificación COMPACTA para que la URL
 * sea corta y el mensaje se vea profesional:
 *
 *   token = base64url( bizUuid(16B) ++ idUuid(16B) ++ HMAC-SHA256(payload)[0:10] )
 *
 * → 42 bytes ≈ 56 caracteres (antes ~145 con el `businessId:id` en texto).
 *
 * SEGURIDAD (SEC-003): el PDF/página se sirven con service-role (bypassa RLS),
 * acotados por el `businessId` DENTRO del token. Por eso el secreto DEBE ser
 * fuerte y único; NUNCA un fallback embebido (permitiría forjar tokens). Si
 * `DOCUMENT_SHARE_SECRET` no está configurado, firmar/verificar fallan cerrado.
 * El HMAC se trunca a 80 bits: businessId+id ya son UUID (no adivinables), así
 * que 80 bits de firma son de sobra contra falsificación.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG_LEN = 10;
const PAYLOAD_LEN = 32; // 16 (businessId) + 16 (id)

// DL-04: expiración. Los tokens NUEVOS llevan versión + timestamp de emisión y
// caducan tras `SHARE_TOKEN_TTL_SECONDS`. Los tokens LEGACY (42 bytes, sin
// timestamp) se siguen aceptando SIN expiración para no romper enlaces ya
// compartidos con clientes; para forzar su caducidad, rotar DOCUMENT_SHARE_SECRET.
const TOKEN_VERSION = 1;
const TS_LEN = 4; // uint32 BE, segundos desde epoch (válido hasta 2106)
const VERSIONED_LEN = 1 + PAYLOAD_LEN + TS_LEN; // 37 bytes firmados
export const SHARE_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 días

function getSecret(): string {
  const secret = process.env.DOCUMENT_SHARE_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error(
      "Los enlaces de PDF compartido están deshabilitados: falta configurar DOCUMENT_SHARE_SECRET (mínimo 24 caracteres) en el servidor.",
    );
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function sigFor(payload: Buffer): Buffer {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest()
    .subarray(0, SIG_LEN);
}

export function signDocumentShareToken(businessId: string, id: string): string {
  if (!UUID_RE.test(businessId) || !UUID_RE.test(id)) {
    throw new Error(
      "Enlace compartido inválido: businessId e id deben ser UUID.",
    );
  }
  // DL-04: formato versionado con timestamp de emisión (para caducidad).
  const ts = Buffer.alloc(TS_LEN);
  ts.writeUInt32BE(Math.floor(Date.now() / 1000) >>> 0, 0);
  const payload = Buffer.concat([
    Buffer.from([TOKEN_VERSION]),
    uuidToBytes(businessId),
    uuidToBytes(id),
    ts,
  ]);
  return b64url(Buffer.concat([payload, sigFor(payload)]));
}

export interface DocumentShareClaims {
  businessId: string;
  id: string;
}

/**
 * Verifica el token y devuelve `{ businessId, id }`, o `null` si la firma no
 * coincide, el formato es inválido o falta el secreto (fail-closed). El
 * `timingSafeEqual` protege contra ataques de temporización.
 */
export function verifyDocumentShareToken(
  token: string | null | undefined,
): DocumentShareClaims | null {
  if (!token || typeof token !== "string") return null;

  let raw: Buffer;
  try {
    raw = fromB64url(token);
  } catch {
    return null;
  }

  // Helper de verificación de firma (fail-closed si falta el secreto).
  const sigOk = (payload: Buffer, sig: Buffer): boolean => {
    let expected: Buffer;
    try {
      expected = sigFor(payload);
    } catch {
      return false;
    }
    return sig.length === expected.length && crypto.timingSafeEqual(sig, expected);
  };

  // DL-04: formato NUEVO versionado (con expiración).
  if (raw.length === VERSIONED_LEN + SIG_LEN && raw[0] === TOKEN_VERSION) {
    const payload = raw.subarray(0, VERSIONED_LEN);
    const sig = raw.subarray(VERSIONED_LEN);
    if (!sigOk(payload, sig)) return null;
    const iat = payload.readUInt32BE(1 + PAYLOAD_LEN);
    const now = Math.floor(Date.now() / 1000);
    if (now - iat > SHARE_TOKEN_TTL_SECONDS) return null; // expirado
    return {
      businessId: bytesToUuid(payload.subarray(1, 17)),
      id: bytesToUuid(payload.subarray(17, 33)),
    };
  }

  // Formato LEGACY (42 bytes, sin expiración): enlaces ya compartidos siguen válidos.
  if (raw.length === PAYLOAD_LEN + SIG_LEN) {
    const payload = raw.subarray(0, PAYLOAD_LEN);
    const sig = raw.subarray(PAYLOAD_LEN);
    if (!sigOk(payload, sig)) return null;
    return {
      businessId: bytesToUuid(payload.subarray(0, 16)),
      id: bytesToUuid(payload.subarray(16, 32)),
    };
  }

  return null;
}
