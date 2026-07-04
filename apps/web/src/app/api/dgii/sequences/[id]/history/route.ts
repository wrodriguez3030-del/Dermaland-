import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * GET /api/dgii/sequences/[id]/history — historial de la numeración desde
 * audit_logs (creada/editada/preferida/activada/inactivada + números
 * reservados por el POS via dgii.sequence_reserved). RLS por business.
 */
export async function GET(
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
  const sb = await createServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("audit_logs")
    .select("action, user_name, created_at, metadata")
    .eq("entity", "invoice_numbering")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      { error: "No pude leer el historial." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    history: (data ?? []).map((r) => ({
      action: r.action,
      userName: r.user_name,
      createdAt: r.created_at,
      metadata: r.metadata,
    })),
  });
}
