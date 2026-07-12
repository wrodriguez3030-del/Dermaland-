import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";

/**
 * POST /api/inventory-counts/sync
 *
 * Recibe un scan capturado offline. Idempotente: el índice único
 * (device_id, offline_scan_id) en `inventory_count_scans` evita duplicación
 * cuando el cliente reintenta tras red intermitente.
 *
 * Status codes:
 *  - 201 inserted (nuevo scan)
 *  - 200 already exists (idempotente)
 *  - 400 payload inválido
 *  - 401 sin auth
 *  - 5xx error transitorio — el cliente debe reintentar con backoff
 */

const scanSchema = z.object({
  offline_scan_id: z.string().min(8),
  inventory_count_id: z.string().min(1),
  product_id: z.string().min(1),
  product_lot_id: z.string().nullable(),
  branch_id: z.string().min(1),
  warehouse_id: z.string().min(1),
  barcode: z.string().nullable(),
  scan_source: z.enum(["camera", "bluetooth_scanner", "manual"]),
  scanned_quantity: z.number().int().positive(),
  scanned_at: z.string(),
  scanned_by: z.string().nullable(),
  scanned_by_name: z.string().nullable(),
  device_id: z.string().min(1),
  notes: z.string().nullable(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let ctx;
  try {
    ctx = await getRepoContext();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // SEC-016: el operador que escanea se deriva del JWT, NO del payload del
  // cliente (evita atribuir conteos a otra persona).
  const session = await getSession();
  const { inventoryCount } = getRepositories();
  const result = await inventoryCount.recordScan(ctx, {
    inventoryCountId: parsed.data.inventory_count_id,
    productId: parsed.data.product_id,
    productLotId: parsed.data.product_lot_id ?? undefined,
    branchId: parsed.data.branch_id,
    warehouseId: parsed.data.warehouse_id,
    barcode: parsed.data.barcode ?? undefined,
    scannedQuantity: parsed.data.scanned_quantity,
    scanSource: parsed.data.scan_source,
    scannedBy: ctx.userId ?? "",
    scannedByName: session?.user.fullName ?? "",
    scannedAt: parsed.data.scanned_at,
    deviceId: parsed.data.device_id,
    offlineScanId: parsed.data.offline_scan_id,
    syncStatus: "synced",
    notes: parsed.data.notes ?? undefined,
  });

  return NextResponse.json(
    { ok: true, inserted: result.inserted },
    { status: result.inserted ? 201 : 200 },
  );
}
