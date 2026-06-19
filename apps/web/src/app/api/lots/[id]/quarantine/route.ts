import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de lotes en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { reason } = body as { reason?: string };

    if (!reason?.trim()) {
      return NextResponse.json(
        { error: "El motivo de cuarentena es requerido." },
        { status: 422 },
      );
    }

    const ctx = await getRepoContext();
    const repos = getRepositories();

    const lot = await repos.productLot.byId(ctx, id);
    if (!lot) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    await repos.productLot.quarantine(ctx, id, reason.trim());

    await repos.inventoryMovement.create(ctx, {
      businessId: ctx.businessId,
      branchId: lot.branchId,
      productId: lot.productId,
      lotId: lot.id,
      warehouseId: lot.warehouseId,
      type: "quarantine",
      quantity: 0,
      reason: reason.trim(),
      reference: lot.lotNumber,
      userId: session.user.id,
      userName: session.user.fullName,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
