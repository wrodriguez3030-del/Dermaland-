/**
 * Firmas de tipos para migration-objects.mjs.
 *
 * Ronda de correccion 1 (2026-08-05): cada prueba que importa un .mjs desde
 * TypeScript sin declaracion de tipos produce TS7016 ("implicitly has an
 * 'any' type"), y `apps/web/tsconfig.json` tiene `allowJs: false` — CI
 * (`.github/workflows/ci.yml` -> `pnpm --filter web typecheck`) falla en
 * cuanto se abre el PR. Se declara aqui en vez de usar `allowJs: true` (
 * cambiaria el comportamiento de todo el proyecto, no es decision de esta
 * tarea) o un `declare module` generico con `any` (apagaria el chequeo justo
 * donde mas vale: estas son las interfaces que consume el simulacro de la
 * Tarea 7).
 */

/** Quita comentarios `--` de línea y `/* *\/` de bloque. */
export function stripSqlComments(sql: string): string;

/** Tipos de objeto SQL que `extractObjects` reconoce. Ver PATTERNS en el .mjs. */
export type MigrationObjectKind = "table" | "view" | "column" | "function" | "policy" | "index";

export interface MigrationObject {
  kind: MigrationObjectKind;
  name: string;
}

/** Objetos declarados por el SQL, en orden de aparición y sin repetidos. */
export function extractObjects(sql: string): MigrationObject[];

/**
 * PARCIAL es el veredicto que justifica todo este ejercicio: marcar como
 * "aplicada" una migración a medias convierte un problema visible en invisible.
 */
export type MigrationClassification = "APLICADA" | "NO_APLICADA" | "PARCIAL" | "INDETERMINADA";

export function classify(
  objects: readonly MigrationObject[],
  existing: ReadonlySet<string>,
): MigrationClassification;
