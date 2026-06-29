import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { CashMovementType, PaymentMethod } from "@/types";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

export const dynamic = "force-dynamic";

const VALID_TYPES: ReadonlySet<CashMovementType> = new Set([
  "income",
  "withdrawal",
  "refund",
]);

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de caja en modo local (DATA_SOURCE=mock). Activa Supabase para registrar movimientos.",
    },
    { status: 409 },
  );
}

/** GET /api/cash/[id]/movements → lista los movimientos del turno. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const movements = await getRepositories().cashRegister.movements(ctx, id);
    return NextResponse.json(
      { movements },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los movimientos.") },
      { status: 400 },
    );
  }
}

/**
 * POST /api/cash/[id]/movements
 * Body: { type: "income"|"withdrawal"|"refund", amount: number, method?, reason? }
 * → registra un movimiento manual de efectivo en el turno.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      type?: unknown;
      amount?: unknown;
      method?: unknown;
      reason?: unknown;
    };
    const type = String(body.type) as CashMovementType;
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { error: "Tipo de movimiento inválido." },
        { status: 422 },
      );
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "El monto debe ser un número mayor a cero." },
        { status: 422 },
      );
    }
    const ctx = await getRepoContext();
    const movement = await getRepositories().cashRegister.addMovement(ctx, {
      sessionId: id,
      type,
      amount,
      method: (body.method as PaymentMethod) ?? "cash",
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    return NextResponse.json({ movement });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo registrar el movimiento. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
