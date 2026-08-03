/**
 * Lectura de las fuentes que el motor puro del importador de Alegra necesita:
 * productos y lotes de las DOS sucursales (Principal y Cutis) del negocio.
 *
 * `business_id` sale SIEMPRE de `ctx` (JWT verificado server-side); nunca del
 * archivo que sube el usuario ni del body de la petición.
 */
import "server-only";
import type { ProductLot } from "@/types";
import type { RepoContext, Repositories } from "@/server/repositories";
import { UserFacingRepositoryError } from "@/server/repositories/supabase/client";
import type { PlanLot, PlanProduct } from "./alegra-import";

export interface ImportSources {
  products: PlanProduct[];
  principalLots: PlanLot[];
  cutisLots: PlanLot[];
  cutisWarehouseId: string;
  principalId: string;
  cutisId: string;
  principalName: string;
  cutisName: string;
}

function key(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Resuelve qué sucursal es "Principal" y cuál "Cutis". El archivo de Alegra
 * solo desglosa "Principal"; el resto va a Cutis (decisión del dueño,
 * 2026-08-01). Falla con mensaje legible en vez de adivinar.
 */
export function pickImportBranches(
  branches: Array<{ id: string; name: string }>,
): { principal: { id: string; name: string }; cutis: { id: string; name: string } } {
  const find = (needle: string, label: string) => {
    const hits = branches.filter((b) => key(b.name).includes(needle));
    if (hits.length === 0) {
      throw new UserFacingRepositoryError(
        `No se encontró la sucursal "${label}". Sucursales disponibles: ${branches
          .map((b) => b.name)
          .join(" · ")}`,
      );
    }
    if (hits.length > 1) {
      throw new UserFacingRepositoryError(
        `Hay más de una sucursal que coincide con "${label}": ${hits
          .map((b) => b.name)
          .join(" · ")}. Renombra una para poder importar.`,
      );
    }
    return hits[0]!;
  };
  return { principal: find("principal", "Principal"), cutis: find("cutis", "Cutis") };
}

/**
 * Tamaño de página al traer el catálogo completo de productos. PostgREST
 * (Supabase) corta cada respuesta en 1000 filas EN SILENCIO si no se pagina;
 * a diferencia de `productLot.list` (que ya pagina internamente en la
 * implementación Supabase), `product.list` deja la paginación en manos del
 * llamador (por eso expone `limit`/`offset`) — así que este loop es
 * obligatorio para no perder productos del catálogo (~1355 hoy).
 */
const PRODUCT_PAGE_SIZE = 1000;
/** Tope de seguridad anti-loop-infinito (muy por encima de cualquier catálogo real). */
const PRODUCT_MAX_PAGES = 50;

async function loadAllProducts(
  ctx: RepoContext,
  repos: Repositories,
): Promise<PlanProduct[]> {
  const all: PlanProduct[] = [];
  for (let page = 0; page < PRODUCT_MAX_PAGES; page++) {
    const offset = page * PRODUCT_PAGE_SIZE;
    // Paginación secuencial intencional: cada página depende de haber
    // completado la anterior (no hay forma de paralelizar sin conocer antes
    // el total de filas).
    const batch = await repos.product.list(ctx, {
      // El importador debe poder reconciliar también productos inactivos:
      // que estén desactivados en DermaLand no significa que Alegra no
      // traiga stock para ellos.
      activeOnly: false,
      limit: PRODUCT_PAGE_SIZE,
      offset,
    });
    for (const p of batch) all.push({ id: p.id, name: p.name });
    if (batch.length < PRODUCT_PAGE_SIZE) break;
  }
  return all;
}

function toPlanLot(l: ProductLot): PlanLot {
  return {
    id: l.id,
    productId: l.productId,
    warehouseId: l.warehouseId,
    quantity: l.currentQuantity,
    expiresAt: l.expiresAt,
    receivedAt: l.receivedAt,
    lotNumber: l.lotNumber,
  };
}

/**
 * Lee de la base todo lo que el motor puro (`buildImportPlan`) necesita.
 * Nada de esto viene del cliente: `ctx.businessId` sale del JWT.
 */
export async function loadImportSources(
  ctx: RepoContext,
  repos: Repositories,
): Promise<ImportSources> {
  const branches = await repos.branch.list(ctx);
  const { principal, cutis } = pickImportBranches(
    branches.map((b) => ({ id: b.id, name: b.name })),
  );

  const products = await loadAllProducts(ctx, repos);

  // El almacén es un detalle interno de la sucursal (el usuario nunca lo
  // configura); preferimos el marcado `isMain` por si alguna sucursal
  // llegara a tener más de uno.
  const cutisWarehouses = await repos.warehouse.list(ctx, cutis.id);
  const cutisWarehouse =
    cutisWarehouses.find((w) => w.isMain) ?? cutisWarehouses[0];
  if (!cutisWarehouse) {
    throw new UserFacingRepositoryError(
      `La sucursal "${cutis.name}" no tiene un almacén configurado, así que no se puede crear existencia ahí. Contacta a soporte antes de importar.`,
    );
  }

  // `productLot.list` YA pagina internamente (implementación Supabase) y no
  // permite filtrar por sucursal, así que traemos todos los lotes del
  // negocio y separamos por sucursal en memoria, como sugiere la nota de
  // implementación de esta tarea.
  const allLots = await repos.productLot.list(ctx);
  const principalLots = allLots
    .filter((l) => l.branchId === principal.id)
    .map(toPlanLot);
  const cutisLots = allLots
    .filter((l) => l.branchId === cutis.id)
    .map(toPlanLot);

  return {
    products,
    principalLots,
    cutisLots,
    cutisWarehouseId: cutisWarehouse.id,
    principalId: principal.id,
    cutisId: cutis.id,
    principalName: principal.name,
    cutisName: cutis.name,
  };
}
