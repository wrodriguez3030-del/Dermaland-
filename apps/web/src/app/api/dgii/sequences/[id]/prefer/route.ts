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

/** POST /api/dgii/sequences/[id]/prefer — marca esta numeración como preferida (única por tipo+ambiente) */
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
  const { id } = await ctx.params;
  const current = await getNumberingRow(id).catch(() => null);
  if (!current) {
    return NextResponse.json({ error: "Numeración no encontrada" }, { status: 404 });
  }
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  // Quitar la preferida anterior del mismo tipo+ambiente y marcar esta.
  const { error: clearErr } = await sb
    .from("invoice_numberings")
    .update({ is_preferred: false, updated_at: new Date().toISOString() })
    .eq("document_type", current.document_type)
    .eq("environment", current.environment)
    .eq("is_preferred", true)
    .is("deleted_at", null)
    .neq("id", id);
  if (clearErr) {
    return NextResponse.json(
      { error: friendlyDbError(clearErr.message) },
      { status: 422 },
    );
  }
  const { data, error: updErr } = await sb
    .from("invoice_numberings")
    .update({ is_preferred: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) {
    return NextResponse.json(
      { error: friendlyDbError(updErr.message) },
      { status: 422 },
    );
  }

  await auditNumbering(session, "dgii.numbering_preferred", id, {
    name: current.name,
    environment: current.environment,
  });
  return NextResponse.json({ numbering: numberingRowToClient(data) });
}
