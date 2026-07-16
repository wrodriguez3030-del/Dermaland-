import "server-only";
import type { InventoryTransferRepository, RepoContext } from "../types";
import type {
  Transfer,
  TransferItem,
  CreateTransferInput,
} from "@/features/inventory/transfer-store";
import {
  SupabaseRepositoryError,
  UserFacingRepositoryError,
  failRepo,
  getClient,
  pgErrorCode,
} from "./client";
import { resolveBranchWarehouseId } from "./product";
import { buildTransferPayload } from "@/features/inventory/transfer-payload";

// Los tipos generados (database.types.ts) aún no incluyen estas tablas; el client
// de Supabase es `any`, así que tipamos las filas a mano en esta frontera.
interface TransferRow {
  id: string;
  business_id: string;
  transfer_number: string;
  origin_warehouse_id: string;
  destination_warehouse_id: string;
  transfer_date: string;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
interface TransferItemRow {
  id: string;
  business_id: string;
  transfer_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number | string;
  unit_cost: number | string;
  expiration_date: string | null;
  created_at: string;
}

type Sb = Awaited<ReturnType<typeof getClient>>;

/**
 * Ensambla `Transfer[]` a partir de las cabeceras: trae ítems, y resuelve en
 * lote las sucursales (por almacén), los nombres de usuario y los números de
 * lote. Las cabeceras no guardan branch_id/created_by_name/total → se derivan.
 */
async function assemble(
  sb: Sb,
  businessId: string,
  rows: TransferRow[],
): Promise<Transfer[]> {
  if (rows.length === 0) return [];

  const transferIds = rows.map((r) => r.id);
  const { data: itemData } = await sb
    .from("inventory_transfer_items")
    .select("*")
    .eq("business_id", businessId)
    .in("transfer_id", transferIds);
  const itemRows = (itemData ?? []) as TransferItemRow[];

  // Almacén → sucursal.
  const whIds = new Set<string>();
  rows.forEach((r) => {
    whIds.add(r.origin_warehouse_id);
    whIds.add(r.destination_warehouse_id);
  });
  const whToBranch = new Map<string, string>();
  if (whIds.size) {
    const { data: whData } = await sb
      .from("warehouses")
      .select("id,branch_id")
      .eq("business_id", businessId)
      .in("id", Array.from(whIds));
    (whData ?? []).forEach((w: { id: string; branch_id: string }) =>
      whToBranch.set(w.id, w.branch_id),
    );
  }

  // Usuario creador → nombre.
  const userIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter(Boolean)),
  ) as string[];
  const userName = new Map<string, string>();
  if (userIds.length) {
    const { data: uData } = await sb
      .from("users")
      .select("id,full_name")
      .eq("business_id", businessId)
      .in("id", userIds);
    (uData ?? []).forEach((u: { id: string; full_name: string }) =>
      userName.set(u.id, u.full_name),
    );
  }

  // Lote → número de lote (para búsqueda/visualización).
  const lotIds = Array.from(
    new Set(itemRows.map((i) => i.lot_id).filter(Boolean)),
  ) as string[];
  const lotNumber = new Map<string, string>();
  if (lotIds.length) {
    const { data: lData } = await sb
      .from("product_lots")
      .select("id,lot_number")
      .eq("business_id", businessId)
      .in("id", lotIds);
    (lData ?? []).forEach((l: { id: string; lot_number: string }) =>
      lotNumber.set(l.id, l.lot_number),
    );
  }

  const itemsByTransfer = new Map<string, TransferItem[]>();
  for (const it of itemRows) {
    const arr = itemsByTransfer.get(it.transfer_id) ?? [];
    arr.push({
      id: it.id,
      businessId: it.business_id,
      transferId: it.transfer_id,
      productId: it.product_id,
      lotId: it.lot_id ?? "",
      lotNumber: it.lot_id ? lotNumber.get(it.lot_id) ?? "" : "",
      quantity: Number(it.quantity),
      unitCost: Number(it.unit_cost),
      expiresAt: it.expiration_date ?? "",
    });
    itemsByTransfer.set(it.transfer_id, arr);
  }

  return rows.map((r) => {
    const items = itemsByTransfer.get(r.id) ?? [];
    return {
      id: r.id,
      businessId: r.business_id,
      transferNumber: r.transfer_number,
      originWarehouseId: r.origin_warehouse_id,
      originBranchId: whToBranch.get(r.origin_warehouse_id) ?? "",
      destinationWarehouseId: r.destination_warehouse_id,
      destinationBranchId: whToBranch.get(r.destination_warehouse_id) ?? "",
      transferDate: r.transfer_date,
      notes: r.notes ?? undefined,
      status: (r.status === "voided" ? "voided" : "completed") as Transfer["status"],
      createdBy: r.created_by ?? "",
      createdByName: r.created_by ? userName.get(r.created_by) ?? "" : "",
      totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
      items,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/** Próximo número secuencial `TRF-<año>-#####` para el negocio. */
async function nextTransferNumber(sb: Sb, businessId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TRF-${year}-`;
  const { data } = await sb
    .from("inventory_transfers")
    .select("transfer_number")
    .eq("business_id", businessId)
    .like("transfer_number", `${prefix}%`)
    .order("transfer_number", { ascending: false })
    .limit(1);
  const last = (data?.[0]?.transfer_number as string | undefined) ?? undefined;
  let seq = 1;
  if (last) {
    const n = parseInt(last.slice(prefix.length), 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export const inventoryTransferRepository: InventoryTransferRepository = {
  async list(ctx: RepoContext): Promise<Transfer[]> {
    const sb = await getClient("inventoryTransfer.list");
    const { data, error } = await sb
      .from("inventory_transfers")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw failRepo("inventoryTransfer.list", error);
    return assemble(sb, ctx.businessId, (data ?? []) as TransferRow[]);
  },

  async byId(ctx: RepoContext, id: string): Promise<Transfer | null> {
    const sb = await getClient("inventoryTransfer.byId");
    const { data, error } = await sb
      .from("inventory_transfers")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw failRepo("inventoryTransfer.byId", error);
    if (!data) return null;
    const [t] = await assemble(sb, ctx.businessId, [data as TransferRow]);
    return t ?? null;
  },

  async create(ctx: RepoContext, input: CreateTransferInput): Promise<Transfer> {
    const sb = await getClient("inventoryTransfer.create");

    if (!input.originBranchId || !input.destinationBranchId) {
      throw new UserFacingRepositoryError("Selecciona la sucursal origen y la destino.");
    }
    if (input.originBranchId === input.destinationBranchId) {
      throw new UserFacingRepositoryError("La sucursal origen y destino no pueden ser iguales.");
    }
    const validItems = (input.items ?? []).filter(
      (i) => i.lotId && i.productId && i.quantity > 0,
    );
    if (validItems.length === 0) {
      throw new UserFacingRepositoryError("Agrega al menos un producto con cantidad.");
    }

    const originWh = await resolveBranchWarehouseId(
      sb,
      ctx.businessId,
      input.originBranchId,
      undefined,
    );
    const destWh = await resolveBranchWarehouseId(
      sb,
      ctx.businessId,
      input.destinationBranchId,
      undefined,
    );
    if (originWh === destWh) {
      throw new UserFacingRepositoryError(
        "El origen y el destino comparten el mismo almacén; no se puede transferir.",
      );
    }

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const transferNumber = await nextTransferNumber(sb, ctx.businessId);
      const payload = buildTransferPayload({
        transferNumber,
        originBranchId: input.originBranchId,
        originWarehouseId: originWh,
        destinationBranchId: input.destinationBranchId,
        destinationWarehouseId: destWh,
        transferDate: input.transferDate,
        notes: input.notes,
        createdByName: input.createdByName ?? ctx.userName,
        items: validItems.map((i) => ({
          lotId: i.lotId,
          productId: i.productId,
          quantity: i.quantity,
        })),
      });

      const { data, error } = await sb.rpc("transfer_stock_atomic", {
        p_header: payload.header,
        p_items: payload.items,
      });

      if (!error) {
        const newId = (data as { id: string }).id;
        const created = await inventoryTransferRepository.byId(ctx, newId);
        if (!created) {
          throw new SupabaseRepositoryError(
            "inventoryTransfer.create:reload",
            new Error("transferencia no encontrada tras crearla"),
          );
        }
        return created;
      }

      if (/STOCK_INSUFICIENTE/i.test(error.message)) {
        throw new UserFacingRepositoryError(
          "No se pudo transferir: stock insuficiente en uno o más lotes. Actualiza y verifica el stock disponible en el origen.",
        );
      }
      if (pgErrorCode(error) === "23505") {
        lastErr = error; // número de transferencia duplicado por carrera → reintenta
        continue;
      }
      throw new SupabaseRepositoryError("inventoryTransfer.create", error);
    }
    throw new SupabaseRepositoryError(
      "inventoryTransfer.create:retry",
      lastErr instanceof Error ? lastErr : new Error("colisión de número de transferencia"),
    );
  },
};
