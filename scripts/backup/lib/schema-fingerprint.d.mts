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
 */
export interface SchemaFingerprint {
  /** Conteo EXACTO de filas por tabla de public. */
  filas: Record<string, number | string>;
  /** `nombre(args)` de cada función de public, en cualquier orden. */
  funciones: readonly string[];
  /** Conteo de políticas RLS por tabla de public. */
  politicas: Record<string, number | string>;
  /** Nombres de índices de public, en cualquier orden. */
  indices: readonly string[];
}

export interface FingerprintDiff {
  ok: boolean;
  /** Vacío si ok es true. Cada entrada describe un objeto FALTANTE en la copia. */
  problemas: string[];
}

/**
 * Compara la copia contra producción. Solo importa lo que FALTA en la copia:
 * objetos extra (propios de la imagen base del destino) no invalidan nada.
 */
export function diffFingerprints(
  prod: SchemaFingerprint,
  copia: SchemaFingerprint,
): FingerprintDiff;
