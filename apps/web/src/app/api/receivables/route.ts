import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext } from "@/server/auth/context";
import { listPending } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
    { status: 409 },
  );
}

/** Facturas con saldo pendiente (lista maestra del módulo). */
export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const rows = await listPending(ctx);
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las cuentas por cobrar.") },
      { status: 400 },
    );
  }
}
