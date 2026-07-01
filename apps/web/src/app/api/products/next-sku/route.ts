import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

/** Próximo SKU secuencial (DERM-000001…) para previsualizar en el formulario. */
export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Backend en modo local (DATA_SOURCE=mock)." },
      { status: 409 },
    );
  }
  try {
    const ctx = await getRepoContext();
    const sku = await getRepositories().product.nextSku(ctx);
    return NextResponse.json({ sku }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo generar el SKU.") },
      { status: 400 },
    );
  }
}
