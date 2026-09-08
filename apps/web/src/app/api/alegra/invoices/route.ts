import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { idDeLaBase } from "@/lib/utils/uuid-schema";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { ALEGRA_READ_ROLES } from "@/features/alegra/roles";
import { facturasDeCliente } from "@/server/services/alegra/queries";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  clientId: idDeLaBase,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Historial de compras de un cliente según Alegra. Solo lectura. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ invoices: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await authorizeRole(ALEGRA_READ_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = querySchema.safeParse({
    clientId: req.nextUrl.searchParams.get("clientId"),
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta el cliente o el límite no es válido." }, { status: 400 });
  }

  try {
    const ctx = await getRepoContext();
    const invoices = await facturasDeCliente(ctx, parsed.data.clientId, parsed.data.limit);
    return NextResponse.json({ invoices }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar el historial de Alegra.") },
      { status: 400 },
    );
  }
}
