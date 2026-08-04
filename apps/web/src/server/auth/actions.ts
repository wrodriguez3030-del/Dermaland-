"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createServer } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export interface AuthResult {
  ok: boolean;
  error?: string;
  requiresMfa?: boolean;
}

/**
 * Login con email + password. Si hay 2FA configurada el flujo continúa
 * en `verifyMfa()`.
 *
 * En modo mock no hay verificación real — cualquier email entra.
 */
export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Email o contraseña inválidos." };
  }

  const isProd = process.env.NODE_ENV === "production";
  if (env.DATA_SOURCE === "mock" || !isSupabaseConfigured()) {
    // DL-09: fail-closed en producción — nunca aceptar credenciales mock aunque
    // el entorno quede mal configurado (deploy incompleto, rotación fallida).
    if (isProd) {
      return { ok: false, error: "Autenticación no configurada." };
    }
    // Modo demo (solo fuera de producción): aceptar cualquier credencial
    const c = await cookies();
    c.set("dl-mock-session", parsed.data.email, {
      httpOnly: true,
      secure: isProd, // DL-16
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
    });
    return { ok: true };
  }

  const sb = await createServer();
  if (!sb) return { ok: false, error: "Auth no configurada." };

  const { data, error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message };

  // Si el usuario tiene MFA activo, Supabase devuelve session pero requiere
  // `auth.mfa.challenge()` antes de rutas privilegiadas (admin/súper admin).
  const factors = data.user?.factors ?? [];
  const verified = factors.some((f) => f.status === "verified");
  return { ok: true, requiresMfa: verified };
}

/** Cierra la sesión sin redirigir. Cada puerta decide a dónde vuelve el suyo. */
async function limpiarSesion(): Promise<void> {
  if (env.DATA_SOURCE === "mock" || !isSupabaseConfigured()) {
    const c = await cookies();
    c.delete("dl-mock-session");
    return;
  }
  const sb = await createServer();
  await sb?.auth.signOut();
}

/** Logout del PERSONAL — limpia cookies y redirige a /login. */
export async function signOut(): Promise<void> {
  await limpiarSesion();
  redirect("/login");
}

/**
 * Logout de un CLIENTE de la tienda.
 *
 * Función aparte y no un parámetro de `signOut`: esa se usa directamente como
 * `action` de un formulario, así que su primer argumento es el `FormData` que
 * envía el navegador, no un destino.
 *
 * Vuelve a `/tienda` y no a `/login`: el login del ERP no es su puerta, y
 * mandarlo ahí después de cerrar sesión sería ofrecerle una que no puede abrir.
 */
export async function signOutCustomer(): Promise<void> {
  await limpiarSesion();
  redirect("/tienda");
}

/**
 * Verificar TOTP — para admins y súper admin.
 *
 * Esquema: el cliente escanea QR generado por Supabase MFA, ingresa código
 * de 6 dígitos. Aquí lo verificamos y elevamos la sesión a "MFA-verified"
 * por la duración del JWT.
 */
export async function verifyMfa(code: string): Promise<AuthResult> {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = await createServer();
  if (!sb) return { ok: false };

  const { data: factors } = await sb.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: false, error: "MFA no configurada para este usuario." };

  const challenge = await sb.auth.mfa.challenge({ factorId: totp.id });
  if (challenge.error) return { ok: false, error: challenge.error.message };

  const verified = await sb.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.data.id,
    code,
  });
  return verified.error
    ? { ok: false, error: verified.error.message }
    : { ok: true };
}
