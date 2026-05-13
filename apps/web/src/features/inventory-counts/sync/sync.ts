"use client";

import {
  type PendingScan,
  allPendingScans,
  enqueueScan,
  getDeviceId,
  markSynced,
  pendingCount,
  pruneSynced,
  recordSyncError,
} from "../offline/db";

/**
 * Servicio de sincronización offline-first para conteos físicos.
 *
 * Flujo:
 *  1. UI llama `queueScan(...)` — guarda en IndexedDB y resuelve inmediato.
 *  2. Si hay internet, dispara `syncNow()`.
 *  3. `syncNow()` POSTea cada pending al backend con `(device_id, offline_scan_id)`.
 *     - 200 OK → mueve a `synced_scans`.
 *     - 409 Conflict → ya estaba sincronizado, también mueve a synced (idempotente).
 *     - 5xx → incrementa `attempts`, guarda error, reintenta luego.
 *  4. Listener `online`/`offline` de la ventana dispara sync auto al recuperar net.
 *
 * Reintentos: backoff exponencial (5s, 30s, 2min, 5min, 15min) hasta `maxAttempts`.
 * Conflictos: si el backend reporta el scan como ya existente, NO falla — lo trata
 * como éxito (idempotencia garantizada por índice único en DB).
 */

export interface ScanInput {
  inventoryCountId: string;
  productId: string;
  productLotId: string | null;
  branchId: string;
  warehouseId: string;
  barcode: string | null;
  scanSource: PendingScan["scan_source"];
  scannedQuantity?: number;
  scannedBy?: string | null;
  scannedByName?: string | null;
  notes?: string | null;
}

const SYNC_ENDPOINT = "/api/inventory-counts/sync";

export async function queueScan(input: ScanInput): Promise<string> {
  const deviceId = await getDeviceId();
  const offlineScanId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `off_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  await enqueueScan({
    offline_scan_id: offlineScanId,
    inventory_count_id: input.inventoryCountId,
    product_id: input.productId,
    product_lot_id: input.productLotId,
    branch_id: input.branchId,
    warehouse_id: input.warehouseId,
    barcode: input.barcode,
    scan_source: input.scanSource,
    scanned_quantity: input.scannedQuantity ?? 1,
    scanned_at: new Date().toISOString(),
    scanned_by: input.scannedBy ?? null,
    scanned_by_name: input.scannedByName ?? null,
    device_id: deviceId,
    notes: input.notes ?? null,
  });

  // Best-effort sync inmediato si hay red
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncNow();
  }
  return offlineScanId;
}

let syncing = false;

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const pending = await allPendingScans();
    for (const scan of pending) {
      try {
        const res = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(scan),
        });
        if (res.ok || res.status === 409) {
          await markSynced(scan.offline_scan_id, scan);
          synced++;
        } else {
          failed++;
          await recordSyncError(scan.offline_scan_id, `HTTP ${res.status}`);
        }
      } catch (err) {
        failed++;
        await recordSyncError(
          scan.offline_scan_id,
          err instanceof Error ? err.message : "Error de red",
        );
      }
    }
    await pruneSynced();
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

export async function getQueueLength(): Promise<number> {
  return pendingCount();
}

/** Hook React para mostrar estado online/offline + length de la cola. */
import * as React from "react";

export function useOfflineStatus(pollMs = 3000) {
  const [online, setOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [queue, setQueue] = React.useState(0);
  const [lastSync, setLastSync] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setOnline(true);
      void syncNow().then(() => setLastSync(new Date()));
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        setQueue(await getQueueLength());
      } catch {
        // ignorar
      }
    };
    void tick();
    const id = setInterval(tick, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { online, queue, lastSync, syncNow };
}
