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
export function pgErrorCode(error: unknown): string | undefined {
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
 *  - 23505 unique_violation         → "duplicado"
 *  - 23503 foreign_key_violation    → "referencia inválida / en uso"
 *  - 23502 not_null_violation       → "falta un dato obligatorio"
 *  - 23514 check_violation          → "un valor no cumple las reglas"
 *  - 22P02 invalid_text_representation (uuid/numero mal formado) → "formato inválido"
 *  - 22007 / 22008 datetime inválido → "fecha no válida"
 *  - 42501 insufficient_privilege / RLS → "no tienes permiso"
 */
export function failRepo(method: string, error: unknown): never {
  const code = pgErrorCode(error);
  if (code === "23505") {
    throw new UserFacingRepositoryError(
      "Ya existe un registro con ese valor (duplicado).",
    );
  }
  if (code === "23503") {
    // 23503 cubre dos casos: borrar un catálogo en uso, y crear/editar con una
    // referencia (marca/categoría/lab/sucursal) inexistente. Mensaje neutral a
    // la operación para no decir "no se puede eliminar" en un alta/edición.
    throw new UserFacingRepositoryError(
      "No se pudo completar: hay una referencia inválida o el registro está en uso por otros registros.",
    );
  }
  if (code === "23502") {
    throw new UserFacingRepositoryError(
      "No se pudo guardar: falta un dato obligatorio.",
    );
  }
  if (code === "23514") {
    throw new UserFacingRepositoryError(
      "No se pudo guardar: un valor no cumple las reglas (revisa la cantidad y el estado).",
    );
  }
  if (code === "22P02") {
    throw new UserFacingRepositoryError(
      "No se pudo guardar: un dato tiene un formato inválido (revisa la sucursal y las fechas).",
    );
  }
  if (code === "22007" || code === "22008") {
    throw new UserFacingRepositoryError(
      "No se pudo guardar: la fecha de vencimiento no es válida.",
    );
  }
  if (code === "42501") {
    throw new UserFacingRepositoryError(
      "No se pudo guardar: no tienes permiso para esta acción.",
    );
  }
  throw new SupabaseRepositoryError(method, error);
}

/**
 * Convierte cualquier error de la capa de repositorios en un mensaje apto para
 * mostrar al usuario en una respuesta de API. NUNCA expone el prefijo técnico
 * `SupabaseRepository: …`. Los `UserFacingRepositoryError` (ya traducidos por
 * `failRepo`) pasan tal cual; cualquier otro error se loguea en el servidor y
 * el usuario recibe `fallback`. Los errores de Postgres no contienen secretos,
 * así que es seguro loguear `code`/`message` en consola del servidor.
 */
export function toUserFacingMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingRepositoryError) return error.message;
  const detail =
    error instanceof SupabaseRepositoryError
      ? `${error.message} | cause=${pgErrorCode(error.cause) ?? "?"}: ${
          error.cause instanceof Error ? error.cause.message : String(error.cause)
        }`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error("[api] error no traducido:", detail);
  return fallback;
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
