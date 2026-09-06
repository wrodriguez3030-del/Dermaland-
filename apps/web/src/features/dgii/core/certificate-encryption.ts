/**
 * Cifrado AES-256-GCM para material de certificados DGII (Fase 7).
 *
 * Sobre sellado JSON: { v:1, alg:"AES-256-GCM", iv, tag, data } (base64).
 * IV random 12 bytes; auth tag 16 bytes. Sin IV fijo. La clave NUNCA se imprime
 * ni aparece en errores. Sin fetch/DB/FS. Solo `getDgiiEncryptionKeyFromEnv` lee env.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type SealedSecret = {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  tag: string;
  data: string;
};

const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Error de configuración/cifrado. NUNCA incluye la clave ni datos sensibles. */
export class DgiiEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DgiiEncryptionError";
  }
}

/**
 * Lee y valida DGII_CERT_ENCRYPTION_KEY (32 bytes en base64). Lanza error claro si
 * falta o es inválida. No imprime la clave.
 */
export function getDgiiEncryptionKeyFromEnv(): Buffer {
  const raw = process.env.DGII_CERT_ENCRYPTION_KEY;
  if (!raw || raw.trim() === "") {
    throw new DgiiEncryptionError("Clave de cifrado no configurada (DGII_CERT_ENCRYPTION_KEY ausente).");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new DgiiEncryptionError("DGII_CERT_ENCRYPTION_KEY no es base64 válido.");
  }
  if (key.length !== KEY_BYTES) {
    throw new DgiiEncryptionError(`DGII_CERT_ENCRYPTION_KEY debe ser 32 bytes en base64 (recibidos ${key.length}).`);
  }
  return key;
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new DgiiEncryptionError("Clave de cifrado inválida (se requieren 32 bytes).");
  }
}

export function sealBytesAesGcm(data: Uint8Array, key: Buffer): SealedSecret {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
}

export function openBytesAesGcm(sealed: SealedSecret, key: Buffer): Uint8Array {
  assertKey(key);
  if (!sealed || sealed.alg !== "AES-256-GCM" || !sealed.iv || !sealed.tag || !sealed.data) {
    throw new DgiiEncryptionError("Sobre sellado inválido.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]);
    return new Uint8Array(dec);
  } catch {
    // Falla de auth tag (tamper) o clave incorrecta. Sin detalle sensible.
    throw new DgiiEncryptionError("No se pudo descifrar (datos manipulados o clave incorrecta).");
  }
}

export function sealTextAesGcm(text: string, key: Buffer): SealedSecret {
  return sealBytesAesGcm(new TextEncoder().encode(text), key);
}

export function openTextAesGcm(sealed: SealedSecret, key: Buffer): string {
  return new TextDecoder().decode(openBytesAesGcm(sealed, key));
}
