import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  getNumberingRow,
  numberingRowToClient,
  auditNumbering,
  friendlyDbError,
} from "@/server/services/dgii/numbering-admin";
import { canManageNumberings } from "@/features/billing/permissions";

/** POST /api/dgii/sequences/[id]/activate — activa la numeración */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Disponible solo con DATA_SOURCE=supabase" },
      { status: 501 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManageNumberings(session.user.role)) {
    return NextResponse.json({ error: "No tienes permiso para administrar numeraciones." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const current = await getNumberingRow(id).catch(() => null);
  if (!current) {
    return NextResponse.json({ error: "Numeración no encontrada" }, { status: 404 });
  }
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  const { data, error: updErr } = await sb
    .from("invoice_numberings")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("business_id", session.businessId) // SEC-008: filtro de tenant explícito
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) {
    return NextResponse.json(
      { error: friendlyDbError(updErr.message) },
      { status: 422 },
    );
  }

  await auditNumbering(session, "dgii.numbering_activated", id, {
    name: current.name,
    environment: current.environment,
  });
  return NextResponse.json({ numbering: numberingRowToClient(data) });
}
