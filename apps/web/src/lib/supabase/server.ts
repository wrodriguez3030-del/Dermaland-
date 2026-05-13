import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/server/db/database.types";

/**
 * Server-side Supabase client (Server Components, Server Actions, Route Handlers).
 * Reads anon key + reuses cookies — auth.jwt() funciona en RLS.
 *
 * Returns null if Supabase is not configured.
 */
export async function createServer() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll desde Server Component es no-op (Next limitation).
            // El middleware se encarga de refrescar cookies.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. **NUNCA** usar en Client Components.
 * Bypassea RLS — solo para tareas administrativas (super admin, jobs, webhooks)
 * con verificación EXPLÍCITA de business_id antes de cada query.
 *
 * Documentado en `riesgos.md` → R-SEC-01.
 */
export function createServiceRoleClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
