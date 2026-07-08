import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { generateReportPdf } from "@/server/services/reports/report-pdf";
import type { ReportPdfSpec } from "@/lib/reports/pdf/types";

/**
 * POST /api/reports/pdf
 *
 * Renderiza un PDF profesional de reporte a partir del `spec` que envía la
 * pantalla (mismos datos/filtros que se ven y que exporta el Excel). Requiere
 * SESIÓN activa (mock autoriza en demo; supabase exige JWT válido) — así ningún
 * anónimo puede invocarlo. El spec sólo contiene datos ya visibles para el
 * usuario (obtenidos vía RLS), por lo que renderizarlos no expone nada nuevo ni
 * cruza negocios. NO toca DGII real ni datos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRIENDLY_ERROR = "No se pudo generar el PDF. Intenta nuevamente.";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { spec?: ReportPdfSpec; fileName?: string };
    const spec = body.spec;
    if (!spec || !spec.meta || !Array.isArray(spec.sections)) {
      return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 400 });
    }
    const pdf = await generateReportPdf(spec);
    const filename = (body.fileName ?? "Reporte_DermaLand.pdf").replace(/[^\w.\-]+/g, "_");
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 400 });
  }
}
