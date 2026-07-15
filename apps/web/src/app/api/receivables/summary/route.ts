import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext } from "@/server/auth/context";
import { summary } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

/** KPIs y gráficos del dashboard de Cuentas por Cobrar. */
export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
      { status: 409 },
    );
  }
  try {
    const ctx = await getRepoContext();
    return NextResponse.json({ summary: await summary(ctx) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el resumen de cuentas por cobrar.") },
      { status: 400 },
    );
  }
}
