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
  failures: Array<{ productName: string; error: string; stockAplicado: boolean }>;
  reference: string;
  /** Cuánto tardó la aplicación completa (evidencia para el presupuesto de tiempo del endpoint). */
  durationMs: number;
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

/** Cuántos productos se procesan en paralelo. Acotado para no saturar PostgREST. */
const CONCURRENCY = 8;

interface Job {
  adj: BranchAdjustment;
  branchId: string;
  counter: "appliedPrincipal" | "appliedCutis";
}

/** Lote ya tocado en la base durante este producto, con el valor al que hay que revertirlo si algo más falla. */
interface Touch {
  lotId: string;
  from: number;
}

/**
 * Procesa UN producto de forma atómica-con-compensación:
 *  1. Ajusta el/los lote(s) existentes, o crea el lote heredado en Cutis.
 *  2. Registra el movimiento de inventario.
 *
 * Si el paso 2 (o cualquier ajuste de lote posterior al primero) falla
 * DESPUÉS de haber tocado la base, revierte cada lote tocado a su valor
 * `from` (0 para un lote recién creado, ya que no existía antes). Si la
 * reversión también falla, el producto se reporta con `stockAplicado: true`
 * para que el operador sepa que el inventario de ESE producto quedó
 * desactualizado y necesita revisión manual — nunca se le deja creer que
 * "falló" significa "no se tocó nada".
 *
 * Los contadores (`lotsUpdated`/`lotsCreated`/`movements`/`appliedX`) solo se
 * incrementan cuando el producto queda EN FIRME (movimiento incluido); un
 * producto que falla a mitad de camino, con o sin compensación exitosa, no
 * suma a ningún contador de "aplicado".
 */
async function processProduct(
  ctx: RepoContext,
  repos: Repositories,
  job: Job,
  reference: string,
  reason: string,
  userId: string,
  userName: string,
  res: ApplyResult,
): Promise<void> {
  const { adj, branchId, counter } = job;
  const branchCtx: RepoContext = { ...ctx, branchId };
  const touched: Touch[] = [];
  let localLotsUpdated = 0;
  let localLotsCreated = 0;

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
      localLotsCreated = 1;
      lotId = created.id;
      warehouseId = adj.newLot.warehouseId;
      // No existía antes: su "from" para compensar es 0 (dejarlo sin stock).
      touched.push({ lotId: created.id, from: 0 });
    } else {
      const first = adj.lotChanges[0];
      if (!first) {
        throw new Error("El plan no trae ningún lote que ajustar para este producto.");
      }
      for (const change of adj.lotChanges) {
        await repos.productLot.adjustQuantity(branchCtx, change.lotId, change.to);
        touched.push({ lotId: change.lotId, from: change.from });
        localLotsUpdated++;
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

    // Todo quedó en firme: recién ahora se cuenta.
    res.movements++;
    res[counter]++;
    res.lotsUpdated += localLotsUpdated;
    res.lotsCreated += localLotsCreated;
  } catch (e) {
    let stockAplicado = false;
    let message: string;

    if (touched.length > 0) {
      // Algo ya quedó escrito en la base: compensar ANTES de reportar.
      let compensationFailed = false;
      for (const t of touched) {
        try {
          await repos.productLot.adjustQuantity(branchCtx, t.lotId, t.from);
        } catch {
          compensationFailed = true;
        }
      }
      stockAplicado = compensationFailed;
      const base = toUserFacingMessage(e, "No se pudo completar el registro de este producto.");
      message = compensationFailed
        ? `${base} Además, no se pudo revertir el ajuste de stock ya aplicado: el inventario de este producto quedó desactualizado y necesita revisión manual antes de continuar.`
        : `${base} El ajuste de stock se revirtió automáticamente; no quedó ningún cambio aplicado para este producto.`;
    } else {
      // Nada se tocó en la base todavía (falló antes del primer ajuste/creación).
      message = toUserFacingMessage(e, "No se pudo ajustar este producto.");
    }

    res.failures.push({ productName: adj.productName, error: message, stockAplicado });
  }
}

/**
 * Ejecuta el plan ya calculado en las dos sucursales: ajusta el stock de los
 * lotes existentes (o crea el lote heredado en Cutis cuando no hay ninguno) y
 * registra UN movimiento de inventario por producto ajustado.
 *
 * Cada PRODUCTO es su propia unidad atómica-con-compensación (ver
 * `processProduct`): un fallo en un producto NO aborta el resto, se reporta
 * en `failures` y se continúa — mismo criterio que el script
 * `scripts/import-stock-principal-from-alegra.mjs`.
 *
 * Los productos se procesan con concurrencia acotada (`CONCURRENCY`) para
 * caber en el presupuesto de tiempo del endpoint sin saturar PostgREST.
 * Nunca se paraleliza una escritura al MISMO lote: cada `BranchAdjustment`
 * pertenece a un único producto+sucursal, y `distribute()` (Task 2) nunca
 * reparte lotes de un producto entre otro — así que dos productos distintos
 * corriendo a la vez jamás compiten por el mismo lote.
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
  const start = Date.now();
  const res: ApplyResult = {
    appliedPrincipal: 0,
    appliedCutis: 0,
    lotsUpdated: 0,
    lotsCreated: 0,
    movements: 0,
    failures: [],
    reference,
    durationMs: 0,
  };
  const reason = `Importación Alegra ${reference} — ajuste de inventario a conteo real`;
  // `ctx.userId`/`ctx.userName` son opcionales en `RepoContext` (algunos
  // llamadores internos no traen sesión), pero `InventoryMovement` los exige.
  // En este endpoint SIEMPRE vienen (el route handler pasa por
  // `authorizeRole` antes de construir el ctx); el fallback es solo defensivo.
  const userId = ctx.userId ?? "";
  const userName = ctx.userName ?? "Sistema";

  const jobs: Job[] = [
    ...plan.principal.map(
      (adj): Job => ({ adj, branchId: sources.principalId, counter: "appliedPrincipal" }),
    ),
    ...plan.cutis.map(
      (adj): Job => ({ adj, branchId: sources.cutisId, counter: "appliedCutis" }),
    ),
  ];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const my = cursor;
      cursor += 1;
      const job = jobs[my];
      if (!job) return;
      await processProduct(ctx, repos, job, reference, reason, userId, userName, res);
    }
  };
  const workerCount = Math.min(CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  res.durationMs = Date.now() - start;
  return res;
}
