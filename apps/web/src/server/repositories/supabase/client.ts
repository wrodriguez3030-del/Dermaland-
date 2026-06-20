import "server-only";
import { createServer } from "@/lib/supabase/server";

/**
 * Helper compartido para los repositorios Supabase.
 *
 * El cliente generado por `@supabase/ssr` tiene generics muy estrictos que
 * a veces rompen el builder cuando los tipos cambian. Para mantener el
 * código de los repos legible, exponemos un `AnySupabase` con `any` en el
 * builder. El runtime no se afecta — los mappers son la frontera real
 * snake_case ↔ camelCase.
 *
 * Mismo patrón usado en `./dgii.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabase = any;

export class SupabaseRepositoryError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`SupabaseRepository: ${message}`);
    this.name = "SupabaseRepositoryError";
    this.cause = cause;
  }
}

/**
 * Error con mensaje ya apto para mostrar al usuario (sin prefijo técnico).
 * Las rutas API devuelven `(e as Error).message` directo al cliente, así que
 * este mensaje termina en el toast tal cual.
 */
export class UserFacingRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingRepositoryError";
  }
}

/** Códigos Postgres que sabemos traducir a lenguaje de usuario. */
function pgErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Lanza SIEMPRE. Traduce las violaciones de restricción Postgres más comunes a
 * un mensaje accionable; el resto se reenvía como `SupabaseRepositoryError`
 * (comportamiento actual, con prefijo técnico para logs).
 *
 *  - 23505 unique_violation → "duplicado"
 *  - 23503 foreign_key_violation (delete de catálogo en uso) → "en uso"
 */
export function failRepo(method: string, error: unknown): never {
  const code = pgErrorCode(error);
  if (code === "23505") {
    throw new UserFacingRepositoryError(
      "Ya existe un registro con ese valor (duplicado).",
    );
  }
  if (code === "23503") {
    throw new UserFacingRepositoryError(
      "No se puede eliminar: está en uso por otros registros.",
    );
  }
  throw new SupabaseRepositoryError(method, error);
}

/**
 * Obtiene un cliente Supabase server-side o lanza un error claro si las
 * env vars no están configuradas. El mensaje incluye "no implementado"
 * para mantener compatibilidad con el test smoke de fallback.
 */
export async function getClient(method: string): Promise<AnySupabase> {
  const client = await createServer();
  if (!client) {
    throw new SupabaseRepositoryError(
      `${method}: Supabase no configurado (faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY) — repo no implementado en este entorno`,
    );
  }
  return client as AnySupabase;
}
