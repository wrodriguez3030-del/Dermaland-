import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { canRegisterCollections } from "@/features/receivables/permissions";
import { collect } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

/**
 * Registrar un cobro (total, parcial o aplicado a varias facturas) contra
 * cuentas por cobrar. Atómico vía RPC ar_apply_payments; los pagos NUNCA se
 * eliminan. Audita cada cobro.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
      { status: 409 },
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    if (!canRegisterCollections(session.user.role)) {
      return NextResponse.json(
        { error: "Tu rol no puede registrar cobros." },
        { status: 403 },
      );
    }
    const body = await req.json();
    const items = Array.isArray(body?.items)
      ? body.items
          .map((i: unknown) => ({
            proformaId: String((i as { proformaId?: unknown })?.proformaId ?? ""),
            amount: Number((i as { amount?: unknown })?.amount ?? 0),
          }))
          .filter((i: { proformaId: string; amount: number }) => i.proformaId && i.amount > 0)
      : [];
    const ctx = await getRepoContext();
    const result = await collect(ctx, {
      items,
      method: String(body?.method ?? ""),
      reference: typeof body?.reference === "string" ? body.reference : undefined,
      bank: typeof body?.bank === "string" ? body.bank : undefined,
      comments: typeof body?.comments === "string" ? body.comments : undefined,
    });
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session.user.id,
      userName: session.user.fullName,
      action: "ar.collect",
      entity: "receivable",
      entityId: result.applied[0]?.proforma_id ?? "multi",
      branchId: ctx.branchId,
      metadata: {
        method: body?.method,
        totalApplied: result.totalApplied,
        invoices: result.applied.map((a) => ({ number: a.number, amount: a.amount, newBalance: a.new_balance })),
      },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo registrar el cobro.") },
      { status: 400 },
    );
  }
}
