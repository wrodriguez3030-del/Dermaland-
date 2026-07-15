import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { canManagePromises } from "@/features/receivables/permissions";
import { updatePromiseStatus } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

/** Cambiar el estado de una promesa: pending → kept | broken. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
      { status: 409 },
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    if (!canManagePromises(session.user.role)) {
      return NextResponse.json({ error: "Tu rol no puede actualizar promesas." }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const status = String(body?.status ?? "");
    if (!["pending", "kept", "broken"].includes(status)) {
      return NextResponse.json({ error: "Estado de promesa inválido." }, { status: 400 });
    }
    const ctx = await getRepoContext();
    const promise = await updatePromiseStatus(ctx, id, status as "pending" | "kept" | "broken");
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session.user.id,
      userName: session.user.fullName,
      action: "ar.promise_update",
      entity: "ar_promise",
      entityId: id,
      branchId: ctx.branchId,
      metadata: { status },
    });
    return NextResponse.json({ promise });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo actualizar la promesa.") },
      { status: 400 },
    );
  }
}
