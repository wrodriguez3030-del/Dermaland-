import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/server/db/database.types";

/**
 * Browser-side Supabase client. Used in client components.
 * Reads anon key — RLS policies are the security boundary.
 *
 * Returns null if Supabase is not configured (DATA_SOURCE=mock).
 *
 * ⚠️ Lee `process.env.NEXT_PUBLIC_*` DIRECTAMENTE, no el objeto `env` de
 * `@/lib/env`. No es un descuido: `env` se construye con
 * `schema.safeParse(process.env)`, y en el navegador eso no funciona. Next.js
 * sustituye al compilar los accesos *directos* (`process.env.NEXT_PUBLIC_X`)
 * por su valor literal, pero NO rellena el objeto `process.env` completo, así
 * que del lado del cliente `env.NEXT_PUBLIC_SUPABASE_URL` es siempre
 * `undefined` — aunque la variable esté bien configurada en Vercel.
 *
 * El síntoma era mudo y caro: esta función devolvía `null` SIEMPRE en el
 * navegador, y las cuatro pantallas que dependen de ella (`/perfil/seguridad`,
 * `/login/mfa`, `/recuperar`, `/restablecer`) mostraban "no disponible en modo
 * demo" en producción. Con el 2FA obligatorio activo eso dejaba a los
 * administradores encerrados: la puerta los mandaba a enrolarse a una pantalla
 * que no podía enrolar.
 *
 * Verificable: el ref del proyecto aparece en `.next/server/**` pero no
 * aparecía en `.next/static/**`. Si alguien vuelve a enrutar esto por `env`,
 * el bundle del navegador se queda otra vez sin credenciales.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient<Database>(url, anonKey);
}
