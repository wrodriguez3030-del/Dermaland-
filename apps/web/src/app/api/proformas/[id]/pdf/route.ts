import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Proforma } from "@/types";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { readSharedProforma } from "@/server/services/sales/shared-document";
import { verifyDocumentShareToken } from "@/server/services/sales/share-token";
import { generateSaleDocumentPdf } from "@/server/services/sales/document-pdf";
import { whatsappPdfFilename } from "@/features/sales/proforma-share";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * GET /api/proformas/[id]/pdf
 *
 * Devuelve el PDF (A4) del documento de venta. Dos vías de autorización:
 *  - `?t=<token>` firmado → lectura pública acotada por businessId (service-role).
 *    Es el enlace que viaja por WhatsApp para que el cliente lo abra sin sesión.
 *  - Sin token → lectura con la sesión del personal (RLS por business_id).
 *
 * Presentación pura: NO toca DGII real ni secuencias fiscales. El PDF marca DEMO
 * cuando el documento no es un e-CF fiscal emitido.
 */
export const dynamic = "force-dynamic";

const NOT_FOUND = "No pudimos abrir este documento.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get("t");
    const claims = verifyDocumentShareToken(token);

    let proforma: Proforma | null = null;

    if (claims && claims.id === id) {
      // Enlace público firmado → lectura acotada por el negocio del token.
      proforma = await readSharedProforma(claims.businessId, id);
      // Fallback: si no hay service-role configurado, intenta con sesión.
      if (!proforma && env.DATA_SOURCE === "supabase") {
        try {
          const ctx = await getRepoContext();
          proforma = await getRepositories().proforma.byId(ctx, id);
        } catch {
          proforma = null;
        }
      }
    } else if (env.DATA_SOURCE === "supabase") {
      // Acceso del personal con sesión (RLS business_id).
      const ctx = await getRepoContext();
      proforma = await getRepositories().proforma.byId(ctx, id);
    }

    if (!proforma) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    const pdf = await generateSaleDocumentPdf(proforma, mockBusiness);
    const filename = whatsappPdfFilename(proforma);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    // Nunca exponemos detalles técnicos al cliente.
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
}
