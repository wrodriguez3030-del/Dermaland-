import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  ruleRowToClient,
  auditIncentive,
} from "@/server/services/incentives/incentive-admin";

/**
 * PATCH  /api/incentives/rules/[id] → edita una regla.
 * DELETE /api/incentives/rules/[id] → soft-delete (mantiene incentivos ya
 *   generados, que llevan snapshot del nombre/tipo).
 */
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

function guard() {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  return null;
}

const FIELD_MAP: Record<string, string> = {
  name: "name",
  ruleType: "rule_type",
  productId: "product_id",
  laboratoryId: "laboratory_id",
  categoryId: "category_id",
  percentage: "percentage",
  fixedAmount: "fixed_amount",
  minSalesAmount: "min_sales_amount",
  startsAt: "starts_at",
  endsAt: "ends_at",
  active: "active",
  note: "note",
};

export async function PATCH(req: NextRequest, ctx: Params): Promise<NextResponse> {
  const b = guard();
  if (b) return b;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, col] of Object.entries(FIELD_MAP)) {
    if (body[k] === undefined) continue;
    if (["percentage", "fixedAmount", "minSalesAmount"].includes(k)) {
      patch[col] = body[k] != null ? Number(body[k]) : null;
    } else if (["productId", "laboratoryId", "categoryId", "startsAt", "endsAt", "note"].includes(k)) {
      patch[col] = (body[k] as string) || null;
    } else {
      patch[col] = body[k];
    }
  }

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await sb
    .from("sales_incentive_rules")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", id)
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: "No se pudo actualizar la regla." }, { status: 422 });
  await auditIncentive(session, "incentives.rule_updated", id, {
    changes: Object.keys(patch).filter((k) => k !== "updated_at"),
  });
  return NextResponse.json({ rule: ruleRowToClient(data) });
}

export async function DELETE(_req: NextRequest, ctx: Params): Promise<NextResponse> {
  const b = guard();
  if (b) return b;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { error } = await sb
    .from("sales_incentive_rules")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: "No se pudo eliminar la regla." }, { status: 422 });
  await auditIncentive(session, "incentives.rule_deleted", id, {});
  return NextResponse.json({ ok: true });
}
