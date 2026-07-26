import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { FINANCE_MANAGE_ROLES } from "@/features/billing/permissions";
import { parseJsonBody } from "@/server/http/parse-body";
import { financeCreate } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de pagos recurrentes en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const recurring = await getRepositories().recurringExpense.list(ctx);
    return NextResponse.json({ recurring }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de gastos. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const auth = await authorizeRole(FINANCE_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, financeCreate);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    const ctx = await getRepoContext();
    const item = await getRepositories().recurringExpense.create(ctx, body);
    return NextResponse.json({ recurring: item }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de gastos. Intenta nuevamente.") }, { status: 400 });
  }
}
