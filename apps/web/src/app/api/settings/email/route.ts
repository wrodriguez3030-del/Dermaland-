import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession, type AuthSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import {
  getEmailSettingsStatus,
  saveEmailSettings,
} from "@/server/services/email/email-settings-service";

/**
 * GET  /api/settings/email  → estado (usuario Gmail + si está configurado). SIN
 *   la contraseña.
 * PUT  /api/settings/email  → guarda (cifra) la contraseña de aplicación.
 *
 * Solo admin/manager del negocio. La contraseña nunca se devuelve.
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Requiere la base compartida activa (DATA_SOURCE=supabase)." },
    { status: 409 },
  );
}

async function requireAdmin(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }
  const role = session.user.role;
  if (!(session.isPlatformAdmin || role === "admin" || role === "manager")) {
    return {
      error: NextResponse.json(
        { error: "Solo un administrador puede configurar el correo." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  try {
    const status = await getEmailSettingsStatus(gate.session.businessId);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar la configuración de correo.") },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      appPassword?: string;
      gmailUser?: string;
    };
    const appPassword = String(body.appPassword ?? "");
    if (!appPassword.replace(/\s+/g, "")) {
      return NextResponse.json(
        { error: "Ingresa la contraseña de aplicación de Gmail." },
        { status: 400 },
      );
    }
    await saveEmailSettings(
      gate.session.businessId,
      { gmailUser: body.gmailUser, appPassword },
      gate.session.user.id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo guardar la configuración de correo.") },
      { status: 400 },
    );
  }
}
