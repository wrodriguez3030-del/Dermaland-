import type { ScanInput } from "./sync/sync";

/** Orígenes de la UI → los que acepta la ruta de sync. */
const ORIGEN: Record<"reader" | "camera" | "manual", ScanInput["scanSource"]> = {
  reader: "bluetooth_scanner",
  camera: "camera",
  manual: "manual",
};

/**
 * Traductor puro de un escaneo de la pantalla al payload de la cola offline.
 * Vive aparte para poder probarlo sin IndexedDB ni red.
 */
export function buildScanInput(args: {
  serverCountId: string;
  productId: string;
  productLotId: string | null;
  branchId: string;
  warehouseId: string;
  barcode: string | null;
  source: "reader" | "camera" | "manual";
  quantity: number;
  userName: string | null;
}): ScanInput {
  return {
    inventoryCountId: args.serverCountId,
    productId: args.productId,
    productLotId: args.productLotId,
    branchId: args.branchId,
    warehouseId: args.warehouseId,
    barcode: args.barcode,
    scanSource: ORIGEN[args.source],
    scannedQuantity: args.quantity,
    scannedBy: null,
    scannedByName: args.userName,
    notes: null,
  };
}
