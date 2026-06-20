import { describe, it, expect } from "vitest";
import {
  CertCipherError,
  deserializeBlob,
  openBytes,
  openString,
  sealBytes,
  sealString,
  serializeBlob,
} from "./cert-cipher";

// 32 bytes random base64url (~43 chars). Generada solo para tests.
const KEY = "Hb6t5K9ZdG4Q3rXkV7m2L8aP1xY0eU6oN4cQ5hA9wS0";
const KEY_ALT = "Rt2u9YqL4mFa1xZ7oH3vJ5sP8gN6cI0bE2dK4hT9wU0";

describe("cert-cipher AES-256-GCM", () => {
  it("seal → open string roundtrip", async () => {
    const blob = await sealString("hello DermaLand", KEY);
    expect(blob.alg).toBe("AES-256-GCM");
    const plain = await openString(blob, KEY);
    expect(plain).toBe("hello DermaLand");
  });

  it("seal → open bytes roundtrip", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]);
    const blob = await sealBytes(data, KEY);
    const plain = await openBytes(blob, KEY);
    expect(Array.from(plain)).toEqual(Array.from(data));
  });

  it("cada sealing produce iv distinto (ciphertext distinto)", async () => {
    const b1 = await sealString("same input", KEY);
    const b2 = await sealString("same input", KEY);
    expect(b1.data).not.toBe(b2.data);
  });

  it("descifrado con key incorrecta falla", async () => {
    const blob = await sealString("secret", KEY);
    await expect(openString(blob, KEY_ALT)).rejects.toThrow(CertCipherError);
  });

  it("blob manipulado falla (tag mismatch)", async () => {
    const blob = await sealString("important", KEY);
    // Flip un byte después del IV+tag (en el ciphertext)
    const raw = Buffer.from(blob.data, "base64");
    const lastIdx = raw.length - 1;
    raw[lastIdx] = (raw[lastIdx] ?? 0) ^ 0xff;
    const tampered = { ...blob, data: raw.toString("base64") };
    await expect(openString(tampered, KEY)).rejects.toThrow(CertCipherError);
  });

  it("key con longitud incorrecta es rechazada", async () => {
    await expect(sealString("x", "tooShort")).rejects.toThrow(CertCipherError);
  });

  it("serialize/deserialize blob preserva contenido", async () => {
    const blob = await sealString("payload", KEY);
    const s = serializeBlob(blob);
    const restored = deserializeBlob(s);
    expect(restored.alg).toBe(blob.alg);
    expect(restored.data).toBe(blob.data);
    const back = await openString(restored, KEY);
    expect(back).toBe("payload");
  });

  it("deserialize de string inválido falla con CertCipherError", () => {
    expect(() => deserializeBlob("not-json")).toThrow(CertCipherError);
    expect(() => deserializeBlob('{"alg":"DES"}')).toThrow(CertCipherError);
  });
});
