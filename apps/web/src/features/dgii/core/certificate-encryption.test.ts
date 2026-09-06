// Portada de agendapp: tests/unit/dgii-certificate-encryption.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  sealBytesAesGcm,
  openBytesAesGcm,
  sealTextAesGcm,
  openTextAesGcm,
  getDgiiEncryptionKeyFromEnv,
  DgiiEncryptionError,
  type SealedSecret,
} from "./certificate-encryption";

const key = randomBytes(32);

describe("AES-256-GCM seal/open", () => {
  it("roundtrip de bytes", () => {
    const data = randomBytes(120);
    const sealed = sealBytesAesGcm(data, key);
    expect(sealed.alg).toBe("AES-256-GCM");
    expect(Buffer.from(openBytesAesGcm(sealed, key)).equals(data)).toBe(true);
  });

  it("roundtrip de texto", () => {
    const text = "BEGIN PRIVATE KEY dummy material ñ áéí";
    expect(openTextAesGcm(sealTextAesGcm(text, key), key)).toBe(text);
  });

  it("IV random → ciphertext distinto para el mismo input", () => {
    const a = sealBytesAesGcm(Buffer.from("xx"), key);
    const b = sealBytesAesGcm(Buffer.from("xx"), key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("tamper del data falla (auth tag)", () => {
    const sealed = sealTextAesGcm("hola", key);
    const tampered: SealedSecret = { ...sealed, data: Buffer.from("otracosa").toString("base64") };
    expect(() => openTextAesGcm(tampered, key)).toThrow(DgiiEncryptionError);
  });

  it("clave incorrecta falla", () => {
    const sealed = sealTextAesGcm("hola", key);
    expect(() => openTextAesGcm(sealed, randomBytes(32))).toThrow(DgiiEncryptionError);
  });

  it("clave de tamaño inválido es rechazada", () => {
    expect(() => sealBytesAesGcm(Buffer.from("x"), randomBytes(16))).toThrow(DgiiEncryptionError);
  });
});

describe("getDgiiEncryptionKeyFromEnv", () => {
  it("lanza error claro si falta la variable", () => {
    const prev = process.env.DGII_CERT_ENCRYPTION_KEY;
    delete process.env.DGII_CERT_ENCRYPTION_KEY;
    try {
      expect(() => getDgiiEncryptionKeyFromEnv()).toThrow(/no configurada/i);
    } finally {
      if (prev !== undefined) process.env.DGII_CERT_ENCRYPTION_KEY = prev;
    }
  });

  it("acepta una clave de 32 bytes en base64", () => {
    const prev = process.env.DGII_CERT_ENCRYPTION_KEY;
    process.env.DGII_CERT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    try {
      expect(getDgiiEncryptionKeyFromEnv().length).toBe(32);
    } finally {
      if (prev !== undefined) process.env.DGII_CERT_ENCRYPTION_KEY = prev;
      else delete process.env.DGII_CERT_ENCRYPTION_KEY;
    }
  });

  it("rechaza clave de longitud incorrecta", () => {
    const prev = process.env.DGII_CERT_ENCRYPTION_KEY;
    process.env.DGII_CERT_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    try {
      expect(() => getDgiiEncryptionKeyFromEnv()).toThrow(/32 bytes/);
    } finally {
      if (prev !== undefined) process.env.DGII_CERT_ENCRYPTION_KEY = prev;
      else delete process.env.DGII_CERT_ENCRYPTION_KEY;
    }
  });

  it("el error nunca incluye el valor de la clave", () => {
    const prev = process.env.DGII_CERT_ENCRYPTION_KEY;
    const secret = randomBytes(16).toString("base64");
    process.env.DGII_CERT_ENCRYPTION_KEY = secret;
    try {
      getDgiiEncryptionKeyFromEnv();
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    } finally {
      if (prev !== undefined) process.env.DGII_CERT_ENCRYPTION_KEY = prev;
      else delete process.env.DGII_CERT_ENCRYPTION_KEY;
    }
  });
});
