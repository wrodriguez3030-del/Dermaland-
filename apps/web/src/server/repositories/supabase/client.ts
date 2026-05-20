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
