import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { signDocumentShareToken } from "@/server/services/sales/share-token";

/**
 * GET /api/proformas/[id]/share-link
 *
 * Devuelve el enlace PÚBLICO para compartir el comprobante con el cliente:
 *  - `viewUrl`: página `/factura/[token]` (HTML con logo/OG, sin login) — es el
 *    enlace que va en el mensaje de WhatsApp/correo.
 *  - `pdfUrl`: PDF firmado directo (`/api/proformas/[id]/pdf?t=…`).
 *
 * Lo llama el PERSONAL con sesión (RLS por business_id) para mintear el token;
 * el token luego autoriza la lectura pública acotada por ese business. Requiere
 * `DOCUMENT_SHARE_SECRET` configurado (si no, firmar lanza y devolvemos 503).
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Los enlaces públicos requieren la base compartida activa." },
      { status: 409 },
    );
  }
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    // Verifica que el documento exista y pertenezca al negocio (RLS) antes de
    // firmar un token para él.
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
      // DOCUMENT_SHARE_SECRET ausente → función deshabilitada (fail-closed).
      return NextResponse.json(
        { error: toUserFacingMessage(e, "Los enlaces públicos no están habilitados.") },
        { status: 503 },
      );
    }

    const origin = req.nextUrl.origin;
    return NextResponse.json({
      viewUrl: `${origin}/factura/${token}`,
      pdfUrl: `${origin}/api/proformas/${id}/pdf?t=${token}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo generar el enlace para compartir.") },
      { status: 400 },
    );
  }
}
