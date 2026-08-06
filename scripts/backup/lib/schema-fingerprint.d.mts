/**
 * Firmas de tipos para schema-fingerprint.mjs.
 * Ver scripts/lib/migration-objects.d.mts para el porqué de este archivo.
 */

/** Consulta que devuelve la huella completa como una sola columna JSON `huella`. */
export const FINGERPRINT_SQL: string;

/**
 * Huella de esquema tal como la produce FINGERPRINT_SQL (o una huella
 * construida a mano para pruebas). Los conteos (`filas`, valores de
 * `politicas`) pueden llegar como number o como string — Postgres bigint via
 * json_build_object normalmente serializa como numero JSON, pero
 * diffFingerprints no depende de eso: todo pasa por Number(...) antes de
 * comparar.
 *
 * Revisión 2 (2026-08-05): se agregan `rls` y `definiciones` — un conteo de
 * políticas puede coincidir con RLS apagado a nivel de tabla (`pg_policies`
 * sigue listando políticas que dejaron de aplicarse), o con la misma
 * cantidad de políticas pero un `USING`/`WITH CHECK` reescrito (por ejemplo
 * a `true`), y ninguna de las dos cosas se nota en un conteo. `politicas` y
 * `rls` ahora también cubren `storage.objects` (no solo `public`), y se
 * agrega `restricciones` (FK/CHECK) — ver el docstring del `.mjs` para el
 * razonamiento completo de cada dimensión.
 */
export interface SchemaFingerprint {
  /** Conteo EXACTO de filas por tabla. Claves de `public` sin calificar
   * (`"products"`); claves fuera de `public` calificadas (`"auth.users"`,
   * `"storage.objects"`). */
  filas: Record<string, number | string>;
  /** `nombre(args)` de cada función de `public`, en cualquier orden. */
  funciones: readonly string[];
  /** Conteo de políticas RLS por tabla (`public` + `storage.objects`). */
  politicas: Record<string, number | string>;
  /** `relrowsecurity` (RLS encendido) por tabla — independiente de si la
   * tabla tiene políticas definidas. */
  rls: Record<string, boolean>;
  /** Hash (cmd + roles + USING + WITH CHECK) por política, clave
   * `"tabla:policyname"` (o `"schema.tabla:policyname"` fuera de `public`). */
  definiciones: Record<string, string>;
  /** Nombres de índices de `public`, en cualquier orden. */
  indices: readonly string[];
  /** Nombres de constraints FOREIGN KEY y CHECK de `public`, en cualquier
   * orden. */
  restricciones: readonly string[];
}

export interface FingerprintDiff {
  ok: boolean;
  /** Vacío si ok es true. Cada entrada describe un objeto FALTANTE, un valor
   * distinto, o (revisión 2) una huella de PRODUCCIÓN demasiado degenerada
   * para servir de referencia — ver `diffFingerprints`. */
  problemas: string[];
}

/**
 * Compara la copia contra producción. Solo importa lo que FALTA en la copia:
 * objetos extra (propios de la imagen base del destino) no invalidan nada.
 *
 * `prod` y `copia` se tipan como `unknown` a propósito: la función no confía
 * en que el llamador ya validó la forma. Antes de comparar, rechaza una
 * `prod` degenerada (vacía, mal formada, sin parsear, con una dimensión
 * ausente) devolviendo `{ ok: false, problemas: [...] }` en vez de aprobarla
 * por no tener nada que comparar — es la corrección al hallazgo CRITICAL de
 * la ronda 1: una huella de producción vacía o rota se leía como "no falta
 * nada". Una `copia` mal formada (null, no-objeto) se trata como "falta
 * todo", nunca lanza excepción.
 */
export function diffFingerprints(prod: unknown, copia: unknown): FingerprintDiff;
