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
  const payload = Buffer.concat([uuidToBytes(businessId), uuidToBytes(id)]);
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
  if (raw.length !== PAYLOAD_LEN + SIG_LEN) return null;

  const payload = raw.subarray(0, PAYLOAD_LEN);
  const sig = raw.subarray(PAYLOAD_LEN);

  // Fail-closed: si el secreto no está configurado (o la firma falla), la
  // verificación RECHAZA (null) en vez de lanzar — la página pública muestra
  // "enlace no disponible" y nunca crashea por una mala config.
  let expected: Buffer;
  try {
    expected = sigFor(payload);
  } catch {
    return null;
  }
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return null;
  }

  return {
    businessId: bytesToUuid(payload.subarray(0, 16)),
    id: bytesToUuid(payload.subarray(16, 32)),
  };
}
