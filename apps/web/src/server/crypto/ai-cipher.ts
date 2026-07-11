import "server-only";
import { webcrypto } from "node:crypto";

/**
 * Cifrado AES-256-GCM para las API keys de proveedores de IA (por empresa).
 *
 * Reglas de seguridad (no negociables):
 *  - La master key vive SOLO en `AI_CREDENTIALS_ENCRYPTION_KEY` (base64/base64url
 *    de 32 bytes) en variables de entorno del servidor. NUNCA se imprime ni loguea.
 *  - Se descifra ÚNICAMENTE en el servidor, justo antes de llamar al proveedor.
 *  - La clave descifrada NUNCA se devuelve al cliente ni se persiste en claro.
 *  - Guardamos ciphertext + iv + auth tag por separado (columnas de
 *    `ai_provider_secrets`), con `encryption_version` para futuras rotaciones.
 *
 * Reusa Web Crypto (sin deps nativas), mismo enfoque que `cert-cipher.ts`.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const AI_ENCRYPTION_VERSION = 1;

export class AiCipherError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`AiCipher: ${message}`);
    this.name = "AiCipherError";
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

function decodeKeyMaterial(keyString: string): Uint8Array {
  let s = keyString.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad === 1) throw new AiCipherError("longitud base64 inválida");
  const buf = Buffer.from(s, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new AiCipherError(`la master key debe ser de ${KEY_BYTES} bytes`);
  }
  return new Uint8Array(buf);
}

async function importKey(keyString: string): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw",
    decodeKeyMaterial(keyString) as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface SealedApiKey {
  /** ciphertext en base64. */
  ciphertext: string;
  /** IV (nonce) de 12 bytes en base64. */
  iv: string;
  /** auth tag (GCM) de 16 bytes en base64. */
  authTag: string;
  version: number;
  /** Últimos 4 caracteres de la clave, para mostrar `••••abcd`. NO es secreto. */
  lastFour: string;
}

/** Cifra una API key. Nunca lanza con la clave en el mensaje. */
export async function encryptApiKey(
  apiKey: string,
  masterKey: string,
): Promise<SealedApiKey> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new AiCipherError("API key vacía");
  const cryptoKey = await importKey(masterKey);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherWithTag = new Uint8Array(
    await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(trimmed) as BufferSource,
    ),
  );
  const cipher = cipherWithTag.slice(0, cipherWithTag.length - TAG_BYTES);
  const tag = cipherWithTag.slice(cipherWithTag.length - TAG_BYTES);
  return {
    ciphertext: Buffer.from(cipher).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    authTag: Buffer.from(tag).toString("base64"),
    version: AI_ENCRYPTION_VERSION,
    lastFour: trimmed.slice(-4),
  };
}

/** Descifra una API key. SOLO servidor, justo antes de llamar al proveedor. */
export async function decryptApiKey(
  sealed: Pick<SealedApiKey, "ciphertext" | "iv" | "authTag">,
  masterKey: string,
): Promise<string> {
  const cipher = new Uint8Array(Buffer.from(sealed.ciphertext, "base64"));
  const iv = new Uint8Array(Buffer.from(sealed.iv, "base64"));
  const tag = new Uint8Array(Buffer.from(sealed.authTag, "base64"));
  const cipherWithTag = new Uint8Array(cipher.length + tag.length);
  cipherWithTag.set(cipher, 0);
  cipherWithTag.set(tag, cipher.length);
  const cryptoKey = await importKey(masterKey);
  try {
    const plain = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      cipherWithTag as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch (err) {
    throw new AiCipherError("descifrado falló (master key incorrecta o dato alterado)", err);
  }
}

/** Máscara para mostrar en UI: `••••••••••••abcd`. Nunca revela la clave. */
export function maskApiKey(lastFour: string | null | undefined): string {
  return `••••••••••••${lastFour ?? "----"}`;
}
