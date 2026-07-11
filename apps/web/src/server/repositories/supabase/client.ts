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
/**
 * Mapa central CÓDIGO POSTGRES → mensaje amigable para el usuario.
 * Devuelve `undefined` si el código no se reconoce (el caller usa su fallback).
 * Estos textos NUNCA contienen detalles técnicos (SQL/UUID/columnas).
 */
export function friendlyForPgCode(
  code: string | undefined,
): string | undefined {
  switch (code) {
    case "23505": // unique_violation
      return "Ya existe un registro con esos datos.";
    case "23503": // foreign_key_violation (referencia inválida o en uso)
      return "No se pudo completar: hay una referencia inválida o el registro está en uso por otros registros.";
    case "23502": // not_null_violation
      return "No se pudo guardar: falta un dato obligatorio.";
    case "23514": // check_violation
      return "No se pudo guardar: un valor no cumple las reglas (revisa la cantidad y el estado).";
    case "22P02": // invalid_text_representation (uuid/número mal formado)
      return "No se pudo guardar: un dato tiene un formato inválido (revisa la sucursal y las fechas).";
    case "22007":
    case "22008": // datetime inválido
      return "No se pudo guardar: la fecha no es válida.";
    case "42501": // insufficient_privilege / RLS
      return "No tienes permiso para realizar esta acción.";
    case "08000":
    case "08003":
    case "08006": // connection errors
      return "No se pudo conectar con la base de datos. Intenta nuevamente.";
    default:
      return undefined;
  }
}

/**
 * Nombre de la constraint / índice único violado en un error 23505, si se puede
 * extraer del error de Postgres/PostgREST. Permite mensajes por-campo
 * ("barcode duplicado" vs "sku duplicado") sin exponer detalles técnicos.
 */
export function pgUniqueConstraint(error: unknown): string | undefined {
  const o = error as
    | { constraint?: string; message?: string; details?: string }
    | null;
  if (o?.constraint) return o.constraint;
  const text = `${o?.message ?? ""} ${o?.details ?? ""}`;
  return (
    text.match(/constraint "([^"]+)"/i)?.[1] ??
    text.match(/index "([^"]+)"/i)?.[1]
  );
}

export function failRepo(method: string, error: unknown): never {
  const msg = friendlyForPgCode(pgErrorCode(error));
  if (msg) throw new UserFacingRepositoryError(msg);
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
  // 1. Ya traducido por failRepo → su mensaje es apto para el usuario.
  if (error instanceof UserFacingRepositoryError) return error.message;

  // 2. Intentar mapear el código Postgres (en el error o en su causa) a un
  //    mensaje específico, AUNQUE el repo haya lanzado SupabaseRepositoryError.
  const code =
    pgErrorCode(error) ??
    (error instanceof SupabaseRepositoryError
      ? pgErrorCode(error.cause)
      : undefined);
  const specific = friendlyForPgCode(code);

  // 3. Log seguro server-side (sin secretos; los errores PG no los contienen).
  const detail =
    error instanceof SupabaseRepositoryError
      ? `${error.message} | cause=${code ?? "?"}: ${
          error.cause instanceof Error ? error.cause.message : String(error.cause)
        }`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error("[api] error:", detail);

  return specific ?? fallback;
}

/** Alias semántico (mapeador central pedido por la auditoría). */
export const mapSupabaseErrorToUserMessage = toUserFacingMessage;

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
