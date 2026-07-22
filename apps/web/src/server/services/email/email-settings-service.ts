import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClient } from "@/server/repositories/supabase/client";
import {
  isAiCredentialsEncryptionConfigured,
  getAiEncryptionKeyOrThrow,
} from "@/lib/env";
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
} from "@/server/crypto/ai-cipher";

/**
 * Configuración de correo por negocio: usuario Gmail + "contraseña de
 * aplicación" (cifrada AES-256-GCM con la master key del servidor). La
 * contraseña descifrada NUNCA se devuelve al cliente; la UI solo ve
 * `configured` + `lastFour` enmascarado.
 *
 * Tabla `email_settings` (RLS por business_id). Reusa el cifrado del módulo de
 * IA (`AI_CREDENTIALS_ENCRYPTION_KEY`).
 */

const DEFAULT_GMAIL_USER = "dermalandrd@gmail.com";

function db(sb: Awaited<ReturnType<typeof getClient>>): SupabaseClient {
  // `email_settings` aún no está en database.types.ts → cliente sin tipar.
  return sb as unknown as SupabaseClient;
}

export interface EmailSettingsStatus {
  gmailUser: string;
  configured: boolean;
  /** Máscara `••••••••••••abcd`, o null si no hay clave. Nunca la clave real. */
  maskedPassword: string | null;
  updatedAt: string | null;
}

/** Estado para la UI — SIN la contraseña. */
export async function getEmailSettingsStatus(
  businessId: string,
): Promise<EmailSettingsStatus> {
  const sb = await getClient("email.getSettings");
  const { data } = await db(sb)
    .from("email_settings")
    .select("gmail_user, last_four, encrypted_password, updated_at")
    .eq("business_id", businessId)
    .maybeSingle();
  const row = data as
    | { gmail_user: string; last_four: string | null; encrypted_password: string | null; updated_at: string | null }
    | null;
  const configured = !!row?.encrypted_password;
  return {
    gmailUser: row?.gmail_user || DEFAULT_GMAIL_USER,
    configured,
    maskedPassword: configured ? maskApiKey(row?.last_four) : null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Guarda (cifra) la contraseña de aplicación. Bloquea si falta la master key. */
export async function saveEmailSettings(
  businessId: string,
  input: { gmailUser?: string; appPassword: string },
  updatedBy?: string,
): Promise<void> {
  if (!isAiCredentialsEncryptionConfigured()) {
    throw new Error(
      "Falta configurar la clave de cifrado del servidor (AI_CREDENTIALS_ENCRYPTION_KEY); no se puede guardar la contraseña de forma segura.",
    );
  }
  const pass = input.appPassword.replace(/\s+/g, "");
  if (!pass) throw new Error("La contraseña de aplicación está vacía.");

  const sealed = await encryptApiKey(pass, getAiEncryptionKeyOrThrow());
  const sb = await getClient("email.saveSettings");
  const { error } = await db(sb)
    .from("email_settings")
    .upsert(
      {
        business_id: businessId,
        gmail_user: (input.gmailUser || DEFAULT_GMAIL_USER).trim(),
        encrypted_password: sealed.ciphertext,
        iv: sealed.iv,
        auth_tag: sealed.authTag,
        encryption_version: sealed.version,
        last_four: sealed.lastFour,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "business_id" },
    );
  if (error) {
    throw new Error("No se pudo guardar la configuración de correo.");
  }
}

/**
 * SOLO servidor: resuelve las credenciales SMTP a usar para enviar.
 * Prioridad: config guardada en la BD (cifrada) → variables de entorno.
 * Devuelve `null` si no hay ninguna configurada.
 */
export async function resolveGmailCredentials(
  businessId: string,
): Promise<{ user: string; pass: string } | null> {
  // 1) BD (por negocio).
  try {
    if (isAiCredentialsEncryptionConfigured()) {
      const sb = await getClient("email.resolveCreds");
      const { data } = await db(sb)
        .from("email_settings")
        .select("gmail_user, encrypted_password, iv, auth_tag")
        .eq("business_id", businessId)
        .maybeSingle();
      const row = data as
        | { gmail_user: string; encrypted_password: string | null; iv: string | null; auth_tag: string | null }
        | null;
      if (row?.encrypted_password && row.iv && row.auth_tag) {
        const pass = await decryptApiKey(
          { ciphertext: row.encrypted_password, iv: row.iv, authTag: row.auth_tag },
          getAiEncryptionKeyOrThrow(),
        );
        if (pass) return { user: row.gmail_user || DEFAULT_GMAIL_USER, pass };
      }
    }
  } catch {
    // Si falla la BD/descifrado, intentar con variables de entorno.
  }

  // 2) Variables de entorno (respaldo).
  const envPass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (envPass) {
    return {
      user: process.env.GMAIL_USER || DEFAULT_GMAIL_USER,
      pass: envPass,
    };
  }
  return null;
}
