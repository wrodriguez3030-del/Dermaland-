import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  updateRule,
  toggleRule,
  deleteRule,
  type RuleInput,
} from "@/server/repositories/supabase/commission";
import { notSupabase, fail } from "../../_helpers";

export const dynamic = "force-dynamic";

/**
 * PATCH con `{ toggle: true }` invierte el estado activo; con un cuerpo de regla
 * lo actualiza. Así el store mantiene `toggleCommissionRule(id)` y
 * `saveCommissionRule("edit", …)` sobre el mismo endpoint.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as (RuleInput & { toggle?: boolean }) | { toggle: true };
    const ctx = await getRepoContext();
    const rule =
      "toggle" in body && body.toggle
        ? await toggleRule(ctx, id)
        : await updateRule(ctx, id, body as RuleInput);
    return NextResponse.json({ rule });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    await deleteRule(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
