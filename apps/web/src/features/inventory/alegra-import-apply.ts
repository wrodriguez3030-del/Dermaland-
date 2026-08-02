/**
 * Ejecuta el plan de importación de inventario de Alegra (Task 2) contra la
 * base: ajusta lotes existentes, crea el lote heredado en Cutis cuando hace
 * falta, y registra la bitácora de movimientos.
 */
import "server-only";
import type { RepoContext, Repositories } from "@/server/repositories";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import type { BranchAdjustment, ImportPlan } from "./alegra-import";
import type { ImportSources } from "./alegra-import-sources";

export interface ApplyResult {
  appliedPrincipal: number;
  appliedCutis: number;
  lotsUpdated: number;
  lotsCreated: number;
  movements: number;
  failures: Array<{ productName: string; error: string }>;
  reference: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Referencia de auditoría estable: `ALEGRA-YYYYMMDD-HHmm` (UTC). */
export function importReference(now: Date): string {
  return (
    `ALEGRA-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  );
}

/**
 * Ejecuta el plan ya calculado en las dos sucursales: ajusta el stock de los
 * lotes existentes (o crea el lote heredado en Cutis cuando no hay ninguno) y
 * registra UN movimiento de inventario por producto ajustado.
 *
 * Un fallo en un producto NO aborta el resto: se reporta en `failures` y se
 * continúa — mismo criterio que el script
 * `scripts/import-stock-principal-from-alegra.mjs`.
 *
 * `warehouse_id` es NOT NULL en `inventory_movements`: en las DOS rutas
 * (lote existente y lote nuevo) sale SIEMPRE del lote afectado, nunca de
 * `sources` — un script que lo omitió el 2026-08-01 aplicó bien los ajustes
 * de stock pero dejó 1355 movimientos sin registrar.
 */
export async function applyImportPlan(
  ctx: RepoContext,
  repos: Repositories,
  plan: ImportPlan,
  sources: ImportSources,
  reference: string,
): Promise<ApplyResult> {
  const res: ApplyResult = {
    appliedPrincipal: 0,
    appliedCutis: 0,
    lotsUpdated: 0,
    lotsCreated: 0,
    movements: 0,
    failures: [],
    reference,
  };
  const reason = `Importación Alegra ${reference} — ajuste de inventario a conteo real`;
  // `ctx.userId`/`ctx.userName` son opcionales en `RepoContext` (algunos
  // llamadores internos no traen sesión), pero `InventoryMovement` los exige.
  // En este endpoint SIEMPRE vienen (el route handler pasa por
  // `authorizeRole` antes de construir el ctx); el fallback es solo defensivo.
  const userId = ctx.userId ?? "";
  const userName = ctx.userName ?? "Sistema";

  const runBranch = async (
    adjustments: BranchAdjustment[],
    branchId: string,
    counter: "appliedPrincipal" | "appliedCutis",
  ): Promise<void> => {
    const branchCtx: RepoContext = { ...ctx, branchId };
    for (const adj of adjustments) {
      try {
        let lotId: string;
        let warehouseId: string;

        if (adj.newLot) {
          const created = await repos.productLot.create(branchCtx, {
            businessId: ctx.businessId,
            branchId,
            productId: adj.productId,
            warehouseId: adj.newLot.warehouseId,
            lotNumber: `AJU-${reference}`,
            expiresAt: adj.newLot.expiresAt,
            receivedAt: new Date().toISOString(),
            initialQuantity: adj.newLot.quantity,
            currentQuantity: adj.newLot.quantity,
            unitCost: 0,
            status: "available",
          });
          res.lotsCreated++;
          lotId = created.id;
          warehouseId = adj.newLot.warehouseId;
        } else {
          const first = adj.lotChanges[0];
          if (!first) {
            throw new Error("El plan no trae ningún lote que ajustar para este producto.");
          }
          for (const change of adj.lotChanges) {
            await repos.productLot.adjustQuantity(branchCtx, change.lotId, change.to);
            res.lotsUpdated++;
          }
          lotId = first.lotId;
          warehouseId = first.warehouseId;
        }

        await repos.inventoryMovement.create(branchCtx, {
          businessId: ctx.businessId,
          branchId,
          productId: adj.productId,
          lotId,
          warehouseId,
          type: adj.delta > 0 ? "adjustment_positive" : "adjustment_negative",
          quantity: Math.abs(adj.delta),
          reason,
          reference,
          userId,
          userName,
        });
        res.movements++;
        res[counter]++;
      } catch (e) {
        // Mensaje legible para el dueño de la farmacia: nunca el error crudo
        // de Postgres/Supabase (mismo criterio que el resto de la API).
        res.failures.push({
          productName: adj.productName,
          error: toUserFacingMessage(e, "No se pudo ajustar este producto."),
        });
      }
    }
  };

  await runBranch(plan.principal, sources.principalId, "appliedPrincipal");
  await runBranch(plan.cutis, sources.cutisId, "appliedCutis");
  return res;
}
