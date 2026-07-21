import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { signDocumentShareToken } from "@/server/services/sales/share-token";
import {
  buildWhatsappShareMessage,
  buildWhatsappShareUrl,
  normalizeWhatsappPhone,
  whatsappPdfFilename,
} from "@/features/sales/proforma-share";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * POST /api/proformas/[id]/share/whatsapp
 *
 * Prepara el envío del comprobante por WhatsApp:
 *  - valida que el cliente tenga teléfono;
 *  - genera un enlace firmado al PDF (descargable sin sesión);
 *  - arma el mensaje profesional y la URL `wa.me`;
 *  - registra la auditoría (sale.whatsapp_share).
 *
 * NO envía el mensaje por sí mismo (no hay WhatsApp API configurada): devuelve
 * `waUrl` para que el cliente abra WhatsApp Web con el mensaje + link al PDF.
 * NO toca DGII real ni secuencias fiscales.
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "El envío por WhatsApp con PDF requiere la base compartida activa." },
      { status: 409 },
    );
  }
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.byId(ctx, id);
    if (!proforma) {
      return NextResponse.json(
        { error: "No pudimos abrir este documento." },
        { status: 404 },
      );
    }

    // Destino de envío: WhatsApp VIGENTE del cliente (no el snapshot congelado
    // en la venta). Si el cliente editó su número, el envío usa el actual;
    // caemos al snapshot solo si el cliente ya no está o no tiene número.
    let sendPhone: string | null | undefined = proforma.customerPhone;
    if (proforma.customerId) {
      try {
        const client = await getRepositories().customer.byId(
          ctx,
          proforma.customerId,
        );
        const live = client?.whatsapp?.trim() || client?.phone?.trim();
        if (live) sendPhone = live;
      } catch {
        // Si no se puede resolver el cliente, usar el snapshot.
      }
    }

    // Validación: el cliente debe tener teléfono/WhatsApp.
    if (!normalizeWhatsappPhone(sendPhone)) {
      return NextResponse.json(
        { error: "Este cliente no tiene teléfono/WhatsApp registrado." },
        { status: 422 },
      );
    }

    // Enlaces firmados (abribles sin sesión por el cliente):
    //  - viewUrl: página `/factura/[token]` (HTML con logo/OG) → es la que viaja
    //    en el mensaje, así WhatsApp muestra la tarjeta con el logo de DermaLand.
    //  - pdfUrl: PDF directo (se devuelve por si el caller lo necesita).
    const token = signDocumentShareToken(ctx.businessId, id);
    const viewUrl = `${req.nextUrl.origin}/factura/${token}`;
    const pdfUrl = `${req.nextUrl.origin}/api/proformas/${id}/pdf?t=${token}`;
    const filename = whatsappPdfFilename(proforma);

    const message = buildWhatsappShareMessage(proforma, mockBusiness, {
      pdfUrl: viewUrl,
    });
    const waUrl = buildWhatsappShareUrl(proforma, mockBusiness, {
      pdfUrl: viewUrl,
      phone: sendPhone,
    });

    // Auditoría / log de envío (best-effort, no rompe el flujo).
    try {
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
          phone: normalizeWhatsappPhone(sendPhone),
          pdfFilename: filename,
          documentNumber: proforma.ecfNumber ?? proforma.number,
        },
      });
    } catch {
      // La auditoría no debe impedir compartir.
    }

    return NextResponse.json({
      ok: true,
      waUrl,
      pdfUrl,
      pdfFilename: filename,
      message,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo preparar el mensaje de WhatsApp. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
