import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  listRules,
  createRule,
  resetRules,
  type RuleInput,
} from "@/server/repositories/supabase/commission";
import { notSupabase, fail } from "../_helpers";
import { denyIfNotCommissionAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const rules = await listRules(ctx);
    return NextResponse.json({ rules }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const body = (await req.json()) as RuleInput;
    const ctx = await getRepoContext();
    const rule = await createRule(ctx, body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** PUT sobre la colección = restablecer las reglas al catálogo por defecto. */
export async function PUT(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const ctx = await getRepoContext();
    const rules = await resetRules(ctx);
    return NextResponse.json({ rules });
  } catch (e) {
    return fail(e);
  }
}
