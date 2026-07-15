import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { canManagePromises } from "@/features/receivables/permissions";
import { createPromise, listPromises } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    return NextResponse.json({ promises: await listPromises(ctx) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar las promesas de pago.") },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    if (!canManagePromises(session.user.role)) {
      return NextResponse.json({ error: "Tu rol no puede registrar promesas de pago." }, { status: 403 });
    }
    const body = await req.json();
    const ctx = await getRepoContext();
    const promise = await createPromise(ctx, {
      clientId: typeof body?.clientId === "string" ? body.clientId : null,
      clientName: String(body?.clientName ?? ""),
      proformaId: typeof body?.proformaId === "string" ? body.proformaId : null,
      promisedDate: String(body?.promisedDate ?? ""),
      amount: Number(body?.amount ?? 0),
      notes: typeof body?.notes === "string" ? body.notes : undefined,
    });
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session.user.id,
      userName: session.user.fullName,
      action: "ar.promise_create",
      entity: "ar_promise",
      entityId: promise.id,
      branchId: ctx.branchId,
      metadata: { clientName: promise.clientName, promisedDate: promise.promisedDate, amount: promise.amount },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return NextResponse.json({ promise }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo registrar la promesa de pago.") },
      { status: 400 },
    );
  }
}
