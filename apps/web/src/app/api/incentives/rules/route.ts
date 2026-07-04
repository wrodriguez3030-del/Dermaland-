import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  ruleRowToClient,
  auditIncentive,
} from "@/server/services/incentives/incentive-admin";

/**
 * GET  /api/incentives/rules → reglas del negocio (RLS).
 * POST /api/incentives/rules → crea una regla. business_id de la sesión.
 * Requiere DATA_SOURCE=supabase.
 */
export const dynamic = "force-dynamic";

const RULE_TYPES = new Set([
  "fixed_per_product",
  "percent_on_sale",
  "percent_on_margin",
  "per_laboratory",
  "per_category",
  "per_goal",
]);

function guard() {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  return null;
}

export async function GET(): Promise<NextResponse> {
  const b = guard();
  if (b) return b;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await sb
    .from("sales_incentive_rules")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: "No se pudieron cargar las reglas." }, { status: 500 });
  return NextResponse.json({ rules: (data ?? []).map(ruleRowToClient) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const b = guard();
  if (b) return b;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  if (!String(body.name ?? "").trim())
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 422 });
  if (!RULE_TYPES.has(String(body.ruleType)))
    return NextResponse.json({ error: "Tipo de regla inválido." }, { status: 422 });

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await sb
    .from("sales_incentive_rules")
    .insert({
      business_id: session.businessId,
      name: String(body.name).trim(),
      rule_type: body.ruleType as string,
      product_id: (body.productId as string) || null,
      laboratory_id: (body.laboratoryId as string) || null,
      category_id: (body.categoryId as string) || null,
      percentage: body.percentage != null ? Number(body.percentage) : null,
      fixed_amount: body.fixedAmount != null ? Number(body.fixedAmount) : null,
      min_sales_amount: body.minSalesAmount != null ? Number(body.minSalesAmount) : null,
      starts_at: (body.startsAt as string) || null,
      ends_at: (body.endsAt as string) || null,
      active: body.active !== false,
      note: (body.note as string) || null,
      created_by: session.user.id,
    })
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: "No se pudo crear la regla." }, { status: 422 });
  await auditIncentive(session, "incentives.rule_created", data.id, {
    name: data.name,
    ruleType: data.rule_type,
  });
  return NextResponse.json({ rule: ruleRowToClient(data) });
}
