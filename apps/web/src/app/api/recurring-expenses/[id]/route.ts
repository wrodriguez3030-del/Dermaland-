import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { FINANCE_MANAGE_ROLES } from "@/features/billing/permissions";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de pagos recurrentes en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const auth = await authorizeRole(FINANCE_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const ctx = await getRepoContext();
    const item = await getRepositories().recurringExpense.update(ctx, id, body);
    return NextResponse.json({ recurring: item });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de gastos. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const auth = await authorizeRole(FINANCE_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const ctx = await getRepoContext();
    await getRepositories().recurringExpense.softDelete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de gastos. Intenta nuevamente.") }, { status: 400 });
  }
}
