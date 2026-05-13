import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/server/db/database.types";

/**
 * Browser-side Supabase client. Used in client components.
 * Reads anon key — RLS policies are the security boundary.
 *
 * Returns null if Supabase is not configured (DATA_SOURCE=mock).
 */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
