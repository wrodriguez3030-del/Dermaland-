import { describe, it, expect } from "vitest";
import {
  validatePassword,
  isStrongPassword,
  PASSWORD_MIN_LENGTH,
  BLOCKED_PASSWORDS,
} from "./password-policy";

describe("password-policy", () => {
  it("acepta una contraseña fuerte", () => {
    const r = validatePassword("Derma#Land7xQ!");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(isStrongPassword("Derma#Land7xQ!")).toBe(true);
  });

  it("rechaza contraseñas cortas (< mínimo)", () => {
    const r = validatePassword("Ab1!xy"); // 6 chars
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes(String(PASSWORD_MIN_LENGTH)))).toBe(true);
  });

  it("rechaza contraseñas comunes aunque parezcan tener largo", () => {
    expect(validatePassword("password123").ok).toBe(false);
    expect(validatePassword("dermaland123").ok).toBe(false);
    expect(validatePassword("qwerty123").ok).toBe(false);
    expect(validatePassword("admin123").ok).toBe(false);
  });

  it("exige mayúscula, minúscula, número y símbolo", () => {
    expect(validatePassword("solominusculas!9aaa").ok).toBe(false); // sin mayúscula
    expect(validatePassword("SOLOMAYUS!9AAAAA").ok).toBe(false); // sin minúscula
    expect(validatePassword("SinNumeros!!aaAA").ok).toBe(false); // sin número
    expect(validatePassword("SinSimbolo9aaAA9").ok).toBe(false); // sin símbolo
  });

  it("la lista de bloqueo es case-insensitive", () => {
    expect(validatePassword("PASSWORD").ok).toBe(false);
    expect(validatePassword("Password").ok).toBe(false);
    expect(BLOCKED_PASSWORDS.has("password")).toBe(true);
  });

  it("nunca expone la contraseña en los mensajes de error", () => {
    const secret = "miClaveSuperSecreta";
    const r = validatePassword(secret);
    expect(r.errors.every((e) => !e.includes(secret))).toBe(true);
  });

  it("maneja entrada vacía/null sin lanzar", () => {
    expect(() => validatePassword("")).not.toThrow();
    // @ts-expect-error — probamos robustez ante null en runtime
    expect(() => validatePassword(null)).not.toThrow();
    expect(validatePassword("").ok).toBe(false);
  });
});
