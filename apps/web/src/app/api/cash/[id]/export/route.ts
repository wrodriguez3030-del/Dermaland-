import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import {
  generateShiftXlsx,
  shiftXlsxFilename,
} from "@/server/services/sales/cash-shift-xlsx";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/**
 * GET /api/cash/[id]/export
 *
 * Descarga el reporte Excel (.xlsx) del "Detalle del turno de caja" de la
 * sesión actual. Lectura con la sesión del personal (RLS por business_id).
 * Solo soporta la sesión EN CURSO (turno actual). Reporte operativo: NO toca
 * DGII real ni secuencias fiscales.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      {
        error:
          "Backend de caja en modo local (DATA_SOURCE=mock). Activa Supabase para exportar.",
      },
      { status: 409 },
    );
  }
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const repos = getRepositories();

    const current = await repos.cashRegister.current(ctx);
    if (!current || current.id !== id) {
      return NextResponse.json(
        { error: "Solo se puede exportar el turno en curso." },
        { status: 404 },
      );
    }

    const allProformas = await repos.proforma.list(ctx);
    const sessionProformas = allProformas.filter(
      (p) => p.cashRegisterSessionId === current.id,
    );

    let branchName: string | null = null;
    try {
      const branch = await repos.branch.byId(ctx, current.branchId);
      branchName = branch?.name ?? null;
    } catch {
      branchName = null;
    }

    let movements: Awaited<ReturnType<typeof repos.cashRegister.movements>> = [];
    try {
      movements = await repos.cashRegister.movements(ctx, current.id);
    } catch {
      movements = [];
    }

    const detail = computeShiftDetail(
      current,
      sessionProformas,
      movements,
      branchName,
    );
    const xlsx = generateShiftXlsx(detail, {
      businessName: mockBusiness.commercialName || "DermaLand",
      generatedAt: new Date().toISOString(),
    });
    const filename = shiftXlsxFilename(detail);

    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el reporte. Intenta nuevamente." },
      { status: 400 },
    );
  }
}
