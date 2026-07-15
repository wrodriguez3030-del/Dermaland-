import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext } from "@/server/auth/context";
import { clientStatement } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

/** Estado de cuenta de un cliente (facturas, pagos, saldo, antigüedad). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
      { status: 409 },
    );
  }
  try {
    const { clientId } = await params;
    const ctx = await getRepoContext();
    return NextResponse.json(
      { statement: await clientStatement(ctx, clientId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo generar el estado de cuenta.") },
      { status: 400 },
    );
  }
}
