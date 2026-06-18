/**
 * Política de contraseñas fuertes — DermaLand.
 *
 * Control compensatorio del gap de seguridad **R-SEC-01** (Leaked Password
 * Protection / HaveIBeenPwned solo disponible en Supabase Pro+). Mientras el
 * proyecto esté en plan Free, Supabase Auth NO bloquea automáticamente
 * contraseñas comprometidas; esta política exige contraseñas fuertes y rechaza
 * las comunes como mitigación. Ver `docs/security.md`.
 *
 * Función pura, sin DOM ni efectos: úsala en frontend (formularios) y en
 * cualquier punto de servidor/scripts donde se ESTABLEZCA una contraseña.
 * Nunca registra ni expone el valor de la contraseña.
 */

export interface PasswordCheck {
  ok: boolean;
  /** Mensajes accionables (genéricos, nunca incluyen la contraseña). */
  errors: string[];
}

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Contraseñas comunes/triviales bloqueadas. Lista mínima curada (no exhaustiva)
 * — la protección real contra credenciales filtradas requiere Supabase Pro
 * (HaveIBeenPwned). Comparación case-insensitive.
 */
export const BLOCKED_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "admin123",
  "dermaland123",
  "qwerty123",
  "qwerty",
  "111111",
  "abc123",
  "iloveyou",
  "letmein",
  "contraseña",
  "contrasena",
]);

/** Reglas mostrables al usuario en la UI. */
export const PASSWORD_RULES: readonly string[] = [
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
  "Al menos una mayúscula",
  "Al menos una minúscula",
  "Al menos un número",
  "Al menos un símbolo",
  "No usar contraseñas comunes",
];

/**
 * Valida una contraseña contra la política. Devuelve `ok` + la lista de
 * incumplimientos. No lanza, no registra el valor.
 */
export function validatePassword(password: string): PasswordCheck {
  const pw = password ?? "";
  const errors: string[] = [];

  if (pw.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[A-ZÁÉÍÓÚÑ]/.test(pw)) {
    errors.push("Debe incluir al menos una mayúscula.");
  }
  if (!/[a-záéíóúñ]/.test(pw)) {
    errors.push("Debe incluir al menos una minúscula.");
  }
  if (!/[0-9]/.test(pw)) {
    errors.push("Debe incluir al menos un número.");
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    errors.push("Debe incluir al menos un símbolo.");
  }
  if (BLOCKED_PASSWORDS.has(pw.trim().toLowerCase())) {
    errors.push("Esta contraseña es demasiado común. Elige otra.");
  }

  return { ok: errors.length === 0, errors };
}

/** `true` si la contraseña cumple la política completa. */
export function isStrongPassword(password: string): boolean {
  return validatePassword(password).ok;
}
