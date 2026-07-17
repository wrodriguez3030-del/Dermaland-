import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { receptionShelfLifeCheck } from "@/features/inventory/reception-shelf-life";
import { canReceiveBelowShelfLife } from "@/features/tenancy/permissions";

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

    // ── Regla de vencimiento del laboratorio (al recibir) ────────────────────
    // Si el lote llega por debajo del mínimo de vida útil del laboratorio del
    // producto: exigir confirmación explícita (422) y que sea admin/manager
    // (403). El override queda auditado tras crear el lote.
    let belowMin: { remainingDays: number | null; minDays: number | null } | null = null;
    if (body?.productId && body?.expiresAt) {
      const product = await repos.product.byId(ctx, body.productId);
      const labId = product?.laboratoryId;
      if (labId) {
        const labs = await repos.laboratory.list(ctx);
        const minShelfLifeDays = labs.find((l) => l.id === labId)?.minShelfLifeDays;
        const check = receptionShelfLifeCheck({ expiresAt: body.expiresAt, minShelfLifeDays });
        if (check.belowMinimum) {
          if (!body.confirmBelowMin) {
            return NextResponse.json(
              {
                error: `Este lote vence en ${check.remainingDays} días; el laboratorio exige un mínimo de ${check.minDays} días.`,
                code: "below_min_shelf_life",
                remainingDays: check.remainingDays,
                minDays: check.minDays,
              },
              { status: 422 },
            );
          }
          if (!canReceiveBelowShelfLife(session.user.role)) {
            return NextResponse.json(
              {
                error:
                  "Solo un administrador o gerente puede recibir un lote por debajo del mínimo de vida útil del laboratorio.",
              },
              { status: 403 },
            );
          }
          belowMin = { remainingDays: check.remainingDays, minDays: check.minDays };
        }
      }
    }

    const lot = await repos.productLot.create(ctx, body);

    if (belowMin) {
      try {
        await repos.audit.log(ctx, {
          businessId: ctx.businessId,
          userId: session.user.id,
          userName: session.user.fullName,
          action: "lot.received_below_min",
          entity: "product_lot",
          entityId: lot.id,
          branchId: lot.branchId,
          metadata: {
            lotNumber: lot.lotNumber,
            productId: lot.productId,
            remainingDays: belowMin.remainingDays,
            minDays: belowMin.minDays,
          },
        });
      } catch {
        // La auditoría no debe romper la recepción.
      }
    }

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
          "No se pudo preparar la sucursal para recibir inventario. Intenta nuevamente.",
        ),
      },
      { status: 400 },
    );
  }
}
