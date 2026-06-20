import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const sp = req.nextUrl.searchParams;
    const ctx = await getRepoContext();
    const repos = getRepositories();
    const lots = await repos.productLot.list(ctx, {
      productId: sp.get("productId") ?? undefined,
    });
    return NextResponse.json({ lots }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los lotes. Intenta de nuevo.") },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const ctx = await getRepoContext();
    const repos = getRepositories();

    const lot = await repos.productLot.create(ctx, body);

    // Registrar movimiento de entrada por el lote inicial.
    await repos.inventoryMovement.create(ctx, {
      businessId: ctx.businessId,
      branchId: lot.branchId,
      productId: lot.productId,
      lotId: lot.id,
      warehouseId: lot.warehouseId,
      type: "entry_purchase",
      quantity: lot.initialQuantity,
      reason: body.reason ?? "Entrada inicial",
      reference: lot.lotNumber,
      userId: session.user.id,
      userName: session.user.fullName,
    });

    return NextResponse.json({ lot }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo guardar el stock. Verifica la sucursal y vuelve a intentar.",
        ),
      },
      { status: 400 },
    );
  }
}
