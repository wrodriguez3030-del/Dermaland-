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

export async function PATCH(
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
    const { newQuantity, decrementBy, reason } = body as {
      newQuantity?: number;
      decrementBy?: number;
      reason?: string;
    };

    const ctx = await getRepoContext();
    const repos = getRepositories();

    // ── SEC-010: modo VENTA — decremento ATÓMICO (evita sobreventa por carrera).
    // El POS usa este modo: en vez de fijar un valor absoluto calculado desde un
    // snapshot posiblemente rancio, resta `decrementBy` con guarda `>= qty`.
    if (typeof decrementBy === "number") {
      if (!Number.isFinite(decrementBy) || decrementBy <= 0) {
        return NextResponse.json({ error: "decrementBy debe ser un número > 0" }, { status: 422 });
      }
      const lot = await repos.productLot.decrementQuantity(ctx, id, Math.round(decrementBy));
      if (!lot) {
        return NextResponse.json(
          { error: "Stock insuficiente para esta venta (otro cobro pudo consumir el lote). Refresca e intenta de nuevo." },
          { status: 409 },
        );
      }
      await repos.inventoryMovement.create(ctx, {
        businessId: ctx.businessId,
        branchId: lot.branchId,
        productId: lot.productId,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        type: "exit_sale",
        quantity: -Math.round(decrementBy),
        reason: reason ?? "Salida por venta",
        reference: lot.lotNumber,
        userId: session.user.id,
        userName: session.user.fullName,
      });
      return NextResponse.json({ lot, delta: -Math.round(decrementBy) });
    }

    // ── Modo AJUSTE MANUAL — cantidad absoluta (compat; poco concurrente).
    if (typeof newQuantity !== "number" || newQuantity < 0) {
      return NextResponse.json(
        { error: "newQuantity debe ser un número >= 0" },
        { status: 422 },
      );
    }

    const currentLot = await repos.productLot.byId(ctx, id);
    if (!currentLot) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    const delta = newQuantity - currentLot.currentQuantity;
    const lot = await repos.productLot.adjustQuantity(ctx, id, newQuantity);

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
      userId: session.user.id,
      userName: session.user.fullName,
    });

    return NextResponse.json({ lot, delta });
  } catch (e) {
    return NextResponse.json(
      {
        error: toUserFacingMessage(
          e,
          "No se pudo ajustar el stock. Intenta de nuevo.",
        ),
      },
      { status: 400 },
    );
  }
}
