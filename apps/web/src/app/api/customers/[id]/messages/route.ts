import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/customers/[id]/messages — historial de ENVÍOS al cliente
 * (facturas por WhatsApp y por correo), para la pestaña "Conversaciones".
 *
 * Se arma desde la auditoría: cada envío registra `sale.whatsapp_share` /
 * `sale.email_share` con el documento y el destinatario. Se acota a las facturas
 * de ESTE cliente (por `customer_id`) y al negocio (service-role scoped en código;
 * el endpoint exige sesión).
 */
export const dynamic = "force-dynamic";

interface SentMessage {
  id: string;
  channel: "whatsapp" | "email";
  to: string | null;
  documentNumber: string | null;
  sentAt: string;
  userName: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ messages: [] });
  }
  try {
    const { id } = await params;
    const ctx = await getRepoContext(); // exige sesión del negocio
    const sb = createServiceRoleClient();
    if (!sb) return NextResponse.json({ messages: [] });

    // 1) Facturas/proformas de este cliente.
    const { data: profs } = await sb
      .from("proformas")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", id);
    const ids = (profs ?? []).map((p) => (p as { id: string }).id);
    if (ids.length === 0) return NextResponse.json({ messages: [] });

    // 2) Envíos (WhatsApp / correo) de esas facturas, más recientes primero.
    const { data: logs } = await sb
      .from("audit_logs")
      .select("id, action, metadata, created_at, user_name")
      .eq("business_id", ctx.businessId)
      .in("entity_id", ids)
      .in("action", ["sale.whatsapp_share", "sale.email_share"])
      .order("created_at", { ascending: false })
      .limit(100);

    const messages: SentMessage[] = (logs ?? []).map((raw) => {
      const l = raw as {
        id: string;
        action: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
        user_name: string | null;
      };
      const meta = l.metadata ?? {};
      const channel = l.action === "sale.email_share" ? "email" : "whatsapp";
      const to =
        (typeof meta.to === "string" && meta.to) ||
        (typeof meta.phone === "string" && meta.phone) ||
        null;
      return {
        id: l.id,
        channel,
        to,
        documentNumber:
          typeof meta.documentNumber === "string" ? meta.documentNumber : null,
        sentAt: l.created_at,
        userName: l.user_name,
      };
    });

    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el historial de envíos."), messages: [] },
      { status: 400 },
    );
  }
}
