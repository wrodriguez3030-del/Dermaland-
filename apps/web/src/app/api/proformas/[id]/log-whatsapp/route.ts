import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";

/**
 * POST /api/proformas/[id]/log-whatsapp
 *
 * Registra en auditoría que la factura se compartió por WhatsApp desde el modal
 * (que abre wa.me del lado cliente y no pasa por el servidor). Así el envío
 * aparece en la pestaña "Conversaciones" del cliente. Best-effort: nunca rompe.
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return NextResponse.json({ ok: true });
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.byId(ctx, id);
    if (!proforma) return NextResponse.json({ ok: true });

    const session = await getSession();
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session?.user.id ?? ctx.userId ?? "",
      userName: session?.user.fullName ?? "Sistema",
      action: "sale.whatsapp_share",
      entity: "proforma",
      entityId: id,
      branchId: ctx.branchId,
      metadata: {
        channel: "whatsapp_web",
        phone: (body.to ?? "").trim() || undefined,
        documentNumber: proforma.ecfNumber ?? proforma.number,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Registrar el envío nunca debe romper el flujo del usuario.
    return NextResponse.json({ ok: true });
  }
}
