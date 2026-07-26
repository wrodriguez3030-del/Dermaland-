import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { FINANCE_MANAGE_ROLES, FINANCE_ADMIN_ROLES } from "@/features/billing/permissions";
import { parseJsonBody } from "@/server/http/parse-body";
import { financeEdit } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de compras en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const invoice = await getRepositories().supplierInvoice.byId(ctx, id);
    if (!invoice) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de compras. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const auth = await authorizeRole(FINANCE_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = await parseJsonBody(req, financeEdit);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data;
    const ctx = await getRepoContext();
    const invoice = await getRepositories().supplierInvoice.update(ctx, id, body);
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de compras. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const auth = await authorizeRole(FINANCE_ADMIN_ROLES);
    if (!auth.ok) return auth.res;
    const ctx = await getRepoContext();
    await getRepositories().supplierInvoice.softDelete(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo completar la operación de compras. Intenta nuevamente.") }, { status: 400 });
  }
}
