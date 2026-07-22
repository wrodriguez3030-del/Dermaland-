import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { signDocumentShareToken } from "@/server/services/sales/share-token";
import { sendEmail } from "@/server/services/email/gmail";
import { buildEmailSubject } from "@/features/sales/proforma-share";
import { buildInvoiceEmailHtml } from "@/features/sales/invoice-email-html";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * POST /api/proformas/[id]/share/email
 *
 * Envía el comprobante por correo (Resend) con el MISMO branding que WhatsApp:
 * logo + documento + total + botón al enlace público `/factura/[token]` (sin
 * login) que permite ver y descargar el PDF.
 *
 * Lo llama el PERSONAL con sesión. Si `RESEND_API_KEY` no está configurado,
 * responde 503 con `notConfigured:true` para que la UI ofrezca el respaldo
 * (abrir el cliente de correo). NO toca DGII real.
 */
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "El envío por correo requiere la base compartida activa." },
      { status: 409 },
    );
  }
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const to = (body.to ?? "").trim();
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json(
        { error: "Ingresa un correo válido." },
        { status: 422 },
      );
    }

    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.byId(ctx, id);
    if (!proforma) {
      return NextResponse.json(
        { error: "No pudimos abrir este documento." },
        { status: 404 },
      );
    }

    let token: string;
    try {
      token = signDocumentShareToken(ctx.businessId, id);
    } catch (e) {
      return NextResponse.json(
        { error: toUserFacingMessage(e, "Los enlaces públicos no están habilitados.") },
        { status: 503 },
      );
    }

    const origin = req.nextUrl.origin;
    const viewUrl = `${origin}/factura/${token}`;
    const logoUrl = `${origin}/api/brand/logo`;
    const subject = buildEmailSubject(proforma, mockBusiness);
    const html = buildInvoiceEmailHtml(proforma, mockBusiness, { viewUrl, logoUrl });

    const result = await sendEmail({ to, subject, html });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, notConfigured: result.notConfigured ?? false },
        { status: result.notConfigured ? 503 : 502 },
      );
    }

    // Auditoría (best-effort).
    try {
      const session = await getSession();
      await getRepositories().audit.log(ctx, {
        businessId: ctx.businessId,
        userId: session?.user.id ?? ctx.userId ?? "",
        userName: session?.user.fullName ?? "Sistema",
        action: "sale.email_share",
        entity: "proforma",
        entityId: id,
        branchId: ctx.branchId,
        metadata: {
          channel: "email",
          to,
          documentNumber: proforma.ecfNumber ?? proforma.number,
        },
      });
    } catch {
      // La auditoría no debe impedir el envío.
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo enviar el correo. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
