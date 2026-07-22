import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { sendEmail } from "@/server/services/email/gmail";
import { resolveGmailCredentials } from "@/server/services/email/email-settings-service";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * POST /api/settings/email/test  → envía un correo de PRUEBA al destinatario
 * indicado usando las credenciales guardadas (o de entorno). Solo admin/manager.
 * Sirve para validar la configuración de Gmail antes de enviar facturas reales.
 */
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND = "#7E8A6E";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Requiere la base compartida activa." },
      { status: 409 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const role = session.user.role;
  if (!(session.isPlatformAdmin || role === "admin" || role === "manager")) {
    return NextResponse.json(
      { error: "Solo un administrador puede enviar la prueba." },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const to = (body.to ?? "").trim();
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "Ingresa un correo válido." }, { status: 422 });
    }

    const creds = await resolveGmailCredentials(session.businessId);
    if (!creds) {
      return NextResponse.json(
        {
          error:
            "Aún no hay contraseña de aplicación configurada. Guárdala primero y vuelve a probar.",
          notConfigured: true,
        },
        { status: 503 },
      );
    }

    const comercio = mockBusiness.commercialName || "DermaLand";
    const logoUrl = `${req.nextUrl.origin}/api/brand/logo`;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f7f4;font-family:Arial,sans-serif;color:#2b2f26;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#fff;border:1px solid #eceee8;border-radius:16px;overflow:hidden;">
          <tr><td style="background:${BRAND};padding:18px 24px;">
            <img src="${logoUrl}" width="36" height="36" alt="${comercio}" style="vertical-align:middle;border-radius:8px;background:#fff;" />
            <span style="color:#fff;font-size:18px;font-weight:bold;vertical-align:middle;margin-left:12px;">${comercio}</span>
          </td></tr>
          <tr><td style="padding:24px;font-size:15px;">
            <p style="margin:0 0 10px;font-weight:bold;">✅ Correo de prueba</p>
            <p style="margin:0;">La configuración de correo de ${comercio} funciona correctamente. Ya puedes enviar facturas por correo desde el sistema.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;

    const result = await sendEmail(
      { to, subject: `Correo de prueba · ${comercio}`, html },
      creds,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo enviar el correo de prueba.") },
      { status: 400 },
    );
  }
}
