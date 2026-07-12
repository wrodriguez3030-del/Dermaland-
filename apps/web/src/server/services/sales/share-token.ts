import crypto from "node:crypto";

/**
 * Token firmado para compartir el PDF de un documento de venta sin sesión.
 *
 * El enlace que viaja por WhatsApp apunta a `/api/proformas/[id]/pdf?t=<token>`.
 * El cliente (sin login) no puede leer la base directamente, así que el token
 * autoriza una lectura acotada por `businessId` (vía service-role en el server).
 *
 * Formato: base64url(`${businessId}:${id}`) + "." + base64url(HMAC-SHA256).
 * El secreto NO se imprime nunca.
 *
 * SEGURIDAD (SEC-003): el PDF se sirve con service-role (bypassa RLS), acotado
 * solo por el `businessId` DENTRO del token. Por eso el secreto de firma DEBE
 * ser fuerte y único; NUNCA un fallback embebido en el código (permitiría forjar
 * tokens y leer PDFs de cualquier empresa). Si `DOCUMENT_SHARE_SECRET` no está
 * configurado, la función de compartir PDF queda DESHABILITADA (fail-closed).
 */

function getSecret(): string {
  const secret = process.env.DOCUMENT_SHARE_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error(
      "Los enlaces de PDF compartido están deshabilitados: falta configurar DOCUMENT_SHARE_SECRET (mínimo 24 caracteres) en el servidor.",
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64url(
    crypto.createHmac("sha256", getSecret()).update(payload).digest(),
  );
}

export function signDocumentShareToken(businessId: string, id: string): string {
  const payload = `${businessId}:${id}`;
  return `${b64url(payload)}.${sign(payload)}`;
}

export interface DocumentShareClaims {
  businessId: string;
  id: string;
}

/**
 * Verifica el token y devuelve `{ businessId, id }`, o `null` si la firma no
 * coincide o el formato es inválido. Comparación en tiempo constante.
 */
export function verifyDocumentShareToken(
  token: string | null | undefined,
): DocumentShareClaims | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadPart, sigPart] = token.split(".", 2);
  if (!payloadPart || !sigPart) return null;

  const expected = sign(payloadPart ? fromB64url(payloadPart).toString() : "");
  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(sigPart);
  if (
    expectedBuf.length !== gotBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, gotBuf)
  ) {
    return null;
  }

  const payload = fromB64url(payloadPart).toString();
  const sep = payload.indexOf(":");
  if (sep <= 0) return null;
  const businessId = payload.slice(0, sep);
  const id = payload.slice(sep + 1);
  if (!businessId || !id) return null;
  return { businessId, id };
}
