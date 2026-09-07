import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  getVaultKeyOrThrow,
  bovedaConfigurada,
  sellarClave,
  abrirClave,
  BovedaError,
} from "./password-vault-cipher";

/**
 * La bóveda guarda claves de acceso REALES. Lo que se prueba aquí no es que
 * cifre —eso ya lo prueba `certificate-encryption`— sino las tres cosas que la
 * hacen segura de usar: que sin llave falle en vez de guardar en claro, que un
 * sobre no se pueda abrir con otra llave, y que un sobre copiado de un usuario
 * a otro NO se abra.
 */

const LLAVE = randomBytes(32).toString("base64");
const OTRA = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.USER_PASSWORD_VAULT_KEY = LLAVE;
});
afterEach(() => {
  delete process.env.USER_PASSWORD_VAULT_KEY;
});

describe("bóveda de claves", () => {
  it("🔴 sin llave configurada NO cifra: lanza", () => {
    delete process.env.USER_PASSWORD_VAULT_KEY;
    expect(() => sellarClave("u1", "Clave-Segura-123")).toThrow(BovedaError);
    expect(bovedaConfigurada()).toBe(false);
  });

  it("🔴 una llave que no son 32 bytes se rechaza", () => {
    process.env.USER_PASSWORD_VAULT_KEY = randomBytes(16).toString("base64");
    expect(() => getVaultKeyOrThrow()).toThrow(/32 bytes/);
    expect(bovedaConfigurada()).toBe(false);
  });

  it("ida y vuelta devuelve la MISMA clave, espacios incluidos", () => {
    // El espacio final importa: si se recortara, lo guardado no abriría la
    // cuenta que GoTrue tiene con la clave original.
    const pw = "Clave con espacio final ";
    expect(abrirClave(sellarClave("u1", pw), "u1")).toBe(pw);
  });

  it("dos sellados de la misma clave son distintos (IV aleatorio)", () => {
    const a = sellarClave("u1", "Clave-Segura-123");
    const b = sellarClave("u1", "Clave-Segura-123");
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
  });

  it("🔴 con otra llave NO se abre: lanza, no devuelve basura", () => {
    const sobre = sellarClave("u1", "Clave-Segura-123");
    process.env.USER_PASSWORD_VAULT_KEY = OTRA;
    expect(() => abrirClave(sobre, "u1")).toThrow(BovedaError);
  });

  it("🔴 el sobre de OTRO usuario no se abre", () => {
    // Una fila copiada de un usuario a otro haría que el ojo enseñara la clave
    // de otra persona como si fuera la suya, sin un solo error.
    const sobre = sellarClave("usuario-a", "Clave-De-A-123");
    expect(() => abrirClave(sobre, "usuario-b")).toThrow(/otro usuario/i);
  });

  it("el error nunca lleva la clave ni el sobre", () => {
    const sobre = sellarClave("u1", "SuperSecreta-999");
    process.env.USER_PASSWORD_VAULT_KEY = OTRA;
    try {
      abrirClave(sobre, "u1");
      expect.unreachable("debía lanzar");
    } catch (e) {
      const texto = `${(e as Error).message}${(e as Error).stack ?? ""}`;
      expect(texto).not.toContain("SuperSecreta-999");
      expect(texto).not.toContain(sobre.data);
    }
  });

  it("no se sella una clave vacía ni sin usuario", () => {
    expect(() => sellarClave("u1", "")).toThrow(BovedaError);
    expect(() => sellarClave("", "Clave-Segura-123")).toThrow(BovedaError);
  });
});
