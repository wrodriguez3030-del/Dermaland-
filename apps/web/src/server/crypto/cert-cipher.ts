import "server-only";
import { webcrypto } from "node:crypto";

/**
 * AES-256-GCM helper para cifrar/descifrar material sensible relacionado
 * a certificados DGII (.p12 blob y password).
 *
 * Reglas:
 *  - La key vive en `DGII_CERT_ENCRYPTION_KEY` (URL-safe base64 de 32
 *    bytes). NUNCA se imprime ni se loguea.
 *  - Cada ciphertext incluye iv (12 bytes) + tag (16 bytes) + cipher.
 *  - El blob serializado es base64 de la concatenación. Se almacena
 *    en columnas `bytea` o en Storage.
 *  - Usamos Web Crypto (`webcrypto.subtle`) para evitar deps nativas.
 *
 * NO usar para cifrado simétrico de datos de cliente. Solo material
 * server-only ligado a `business_id`.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class CertCipherError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`CertCipher: ${message}`);
    this.name = "CertCipherError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function decodeKeyMaterial(keyString: string): Uint8Array {
  // Acepta base64 estándar o base64url. Reemplazamos `-/_` a `+/` y
  // restauramos padding `=` si falta. token_urlsafe(32) genera 43 chars
  // sin padding; agregamos uno.
  let s = keyString.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad === 1) throw new CertCipherError("longitud base64 inválida");
  try {
    const buf = Buffer.from(s, "base64");
    if (buf.length !== KEY_BYTES) {
      throw new CertCipherError(
        `key debe ser ${KEY_BYTES} bytes (${buf.length} recibidos)`,
      );
    }
    return new Uint8Array(buf);
  } catch (err) {
    if (err instanceof CertCipherError) throw err;
    throw new CertCipherError("no pude decodificar la key", err);
  }
}

async function importKey(keyString: string): Promise<CryptoKey> {
  const raw = decodeKeyMaterial(keyString);
  return webcrypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface SealedBlob {
  /** Blob completo (iv || tag || ciphertext) en base64 estándar. */
  data: string;
  /** Algoritmo usado (para futuras rotaciones). */
  alg: "AES-256-GCM";
}

/**
 * Cifra `plaintext` con la `key`. Devuelve un blob serializable que
 * incluye iv + tag + cipher.
 */
export async function sealBytes(
  plaintext: Uint8Array,
  key: string,
): Promise<SealedBlob> {
  const cryptoKey = await importKey(key);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherWithTag = new Uint8Array(
    await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      plaintext as BufferSource,
    ),
  );
  // Web Crypto coloca el tag (16 bytes) al final del ciphertext.
  const cipher = cipherWithTag.slice(0, cipherWithTag.length - TAG_BYTES);
  const tag = cipherWithTag.slice(cipherWithTag.length - TAG_BYTES);
  const combined = new Uint8Array(IV_BYTES + TAG_BYTES + cipher.length);
  combined.set(iv, 0);
  combined.set(tag, IV_BYTES);
  combined.set(cipher, IV_BYTES + TAG_BYTES);
  return {
    data: Buffer.from(combined).toString("base64"),
    alg: "AES-256-GCM",
  };
}

/**
 * Versión conveniente para strings (utf-8).
 */
export async function sealString(
  plaintext: string,
  key: string,
): Promise<SealedBlob> {
  return sealBytes(new TextEncoder().encode(plaintext), key);
}

/**
 * Descifra un blob producido por `sealBytes`. Tira `CertCipherError`
 * si el tag no coincide (manipulación detectada).
 */
export async function openBytes(
  blob: SealedBlob,
  key: string,
): Promise<Uint8Array> {
  if (blob.alg !== "AES-256-GCM") {
    throw new CertCipherError(`alg no soportada: ${blob.alg}`);
  }
  const combined = new Uint8Array(Buffer.from(blob.data, "base64"));
  if (combined.length < IV_BYTES + TAG_BYTES + 1) {
    throw new CertCipherError("blob demasiado corto");
  }
  const iv = combined.slice(0, IV_BYTES);
  const tag = combined.slice(IV_BYTES, IV_BYTES + TAG_BYTES);
  const cipher = combined.slice(IV_BYTES + TAG_BYTES);
  const cipherWithTag = new Uint8Array(cipher.length + tag.length);
  cipherWithTag.set(cipher, 0);
  cipherWithTag.set(tag, cipher.length);
  const cryptoKey = await importKey(key);
  try {
    const plain = new Uint8Array(
      await webcrypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        cipherWithTag as BufferSource,
      ),
    );
    return plain;
  } catch (err) {
    throw new CertCipherError("descifrado falló (key incorrecta o blob alterado)", err);
  }
}

export async function openString(
  blob: SealedBlob,
  key: string,
): Promise<string> {
  const bytes = await openBytes(blob, key);
  return new TextDecoder().decode(bytes);
}

/**
 * Helper para guardar el SealedBlob como string opaco en una columna
 * `text` (`pkcs12_encrypted_blob` puede ser bytea o texto; usamos texto
 * para portabilidad).
 */
export function serializeBlob(blob: SealedBlob): string {
  return JSON.stringify({ v: 1, alg: blob.alg, data: blob.data });
}

export function deserializeBlob(serialized: string): SealedBlob {
  let parsed: { v?: number; alg?: string; data?: string };
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new CertCipherError("blob serializado inválido");
  }
  if (parsed.v !== 1) throw new CertCipherError(`version desconocida: ${parsed.v}`);
  if (parsed.alg !== "AES-256-GCM")
    throw new CertCipherError(`alg desconocida: ${parsed.alg}`);
  if (!parsed.data) throw new CertCipherError("falta data");
  return { data: parsed.data, alg: parsed.alg };
}
