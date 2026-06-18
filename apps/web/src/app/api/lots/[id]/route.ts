import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = await req.json();
    const { newQuantity, reason } = body as { newQuantity: number; reason?: string };

    if (typeof newQuantity !== "number" || newQuantity < 0) {
      return NextResponse.json(
        { error: "newQuantity debe ser un número >= 0" },
        { status: 422 },
      );
    }

    const ctx = await getRepoContext();
    const repos = getRepositories();

    // Leer lote actual para calcular delta.
    const currentLot = await repos.productLot.byId(ctx, id);
    if (!currentLot) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    const delta = newQuantity - currentLot.currentQuantity;

    // Ajustar cantidad absoluta.
    const lot = await repos.productLot.adjustQuantity(ctx, id, newQuantity);

    // Registrar movimiento de ajuste.
    await repos.inventoryMovement.create(ctx, {
      businessId: ctx.businessId,
      branchId: lot.branchId,
      productId: lot.productId,
      lotId: lot.id,
      warehouseId: lot.warehouseId,
      type: delta >= 0 ? "adjustment_positive" : "adjustment_negative",
      quantity: delta,
      reason: reason ?? "Ajuste manual",
      reference: lot.lotNumber,
      userId: ctx.userId ?? "",
      userName: body.userName ?? "",
    });

    return NextResponse.json({ lot });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
