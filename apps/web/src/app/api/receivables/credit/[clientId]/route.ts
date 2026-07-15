import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { canEditCredit } from "@/features/receivables/permissions";

export const dynamic = "force-dynamic";

/** Editar el crédito de un cliente: límite, días, bloqueo. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
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
    if (!canEditCredit(session.user.role)) {
      return NextResponse.json({ error: "Tu rol no puede editar el crédito de clientes." }, { status: 403 });
    }
    const { clientId } = await params;
    const body = await req.json();
    const creditLimit =
      body?.creditLimit == null || body.creditLimit === "" ? null : Number(body.creditLimit);
    const creditDays =
      body?.creditDays == null || body.creditDays === "" ? null : Math.round(Number(body.creditDays));
    if (creditLimit != null && !(creditLimit >= 0)) {
      return NextResponse.json({ error: "El límite de crédito debe ser 0 o mayor." }, { status: 400 });
    }
    if (creditDays != null && !(creditDays >= 0 && creditDays <= 365)) {
      return NextResponse.json({ error: "Los días de crédito deben estar entre 0 y 365." }, { status: 400 });
    }
    const ctx = await getRepoContext();
    const customer = await getRepositories().customer.update(ctx, clientId, {
      creditLimit: creditLimit ?? undefined,
      creditDays: creditDays ?? undefined,
      creditBlocked: Boolean(body?.creditBlocked),
      // `undefined` no toca la columna; para LIMPIAR límite/días mandamos null
      // explícito vía cast (el repo traduce null → columna null).
      ...(creditLimit === null ? ({ creditLimit: null } as unknown as Record<string, never>) : {}),
      ...(creditDays === null ? ({ creditDays: null } as unknown as Record<string, never>) : {}),
    });
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session.user.id,
      userName: session.user.fullName,
      action: "ar.credit_update",
      entity: "client",
      entityId: clientId,
      branchId: ctx.branchId,
      metadata: { creditLimit, creditDays, creditBlocked: Boolean(body?.creditBlocked) },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return NextResponse.json({ customer });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo actualizar el crédito del cliente.") },
      { status: 400 },
    );
  }
}
