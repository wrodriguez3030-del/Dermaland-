import { describe, it, expect } from "vitest";
import { encryptApiKey, decryptApiKey, maskApiKey, AiCipherError } from "./ai-cipher";

// Master key de prueba: 32 bytes en base64 (NO es una clave real).
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const KEY2 = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const API_KEY = "sk-proj-ABCDEFGHIJKLMNOP1234wxyz";

describe("ai-cipher (AES-256-GCM)", () => {
  it("cifra y descifra ida y vuelta", async () => {
    const sealed = await encryptApiKey(API_KEY, KEY);
    const back = await decryptApiKey(sealed, KEY);
    expect(back).toBe(API_KEY);
  });

  it("el ciphertext NO contiene la clave en claro", async () => {
    const sealed = await encryptApiKey(API_KEY, KEY);
    const blob = `${sealed.ciphertext}${sealed.iv}${sealed.authTag}`;
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain("wxyz"); // ni fragmentos legibles
  });

  it("guarda solo los últimos 4 para mostrar enmascarado", async () => {
    const sealed = await encryptApiKey(API_KEY, KEY);
    expect(sealed.lastFour).toBe("wxyz");
    expect(maskApiKey(sealed.lastFour)).toBe("••••••••••••wxyz");
    expect(sealed.version).toBe(1);
  });

  it("una master key distinta NO puede descifrar (GCM detecta manipulación)", async () => {
    const sealed = await encryptApiKey(API_KEY, KEY);
    await expect(decryptApiKey(sealed, KEY2)).rejects.toBeInstanceOf(AiCipherError);
  });

  it("rechaza API key vacía", async () => {
    await expect(encryptApiKey("   ", KEY)).rejects.toBeInstanceOf(AiCipherError);
  });

  it("rechaza master key de tamaño inválido", async () => {
    await expect(encryptApiKey(API_KEY, "corta")).rejects.toBeInstanceOf(AiCipherError);
  });
});
