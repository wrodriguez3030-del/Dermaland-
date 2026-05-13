"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * IndexedDB para conteo offline.
 *
 * Stores:
 *  - `pending_scans`: scans capturados sin internet, esperando sync.
 *  - `synced_scans`: copia de scans ya sincronizados (TTL 7 días, debug).
 *  - `device`: metadata del dispositivo (device_id estable).
 *
 * Cada scan lleva `offline_scan_id` (UUID generado cliente) + `device_id`.
 * El backend (Supabase) tiene índice único `(device_id, offline_scan_id)` —
 * reintentos no duplican (ver `supabase/migrations/0002_phase2_inventory.sql`).
 */

export interface PendingScan {
  offline_scan_id: string;
  inventory_count_id: string;
  product_id: string;
  product_lot_id: string | null;
  branch_id: string;
  warehouse_id: string;
  barcode: string | null;
  scan_source: "camera" | "bluetooth_scanner" | "manual";
  scanned_quantity: number;
  scanned_at: string;
  scanned_by: string | null;
  scanned_by_name: string | null;
  device_id: string;
  notes: string | null;
  attempts: number;
  last_error: string | null;
  created_at: number;
}

interface DermalandDB extends DBSchema {
  pending_scans: {
    key: string;
    value: PendingScan;
    indexes: {
      "by-count": string;
      "by-created": number;
    };
  };
  synced_scans: {
    key: string;
    value: PendingScan & { synced_at: number };
    indexes: { "by-synced": number };
  };
  device: {
    key: "device_id";
    value: { device_id: string; created_at: number };
  };
}

const DB_NAME = "dermaland-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DermalandDB>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (!dbPromise) {
    dbPromise = openDB<DermalandDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const pending = db.createObjectStore("pending_scans", {
          keyPath: "offline_scan_id",
        });
        pending.createIndex("by-count", "inventory_count_id");
        pending.createIndex("by-created", "created_at");

        const synced = db.createObjectStore("synced_scans", {
          keyPath: "offline_scan_id",
        });
        synced.createIndex("by-synced", "synced_at");

        db.createObjectStore("device", { keyPath: "device_id" });
      },
    });
  }
  return dbPromise;
}

/**
 * device_id estable por instalación de la app. Persiste entre recargas.
 */
export async function getDeviceId(): Promise<string> {
  const db = await getDb();
  const tx = db.transaction("device", "readwrite");
  const existing = await tx.store.get("device_id");
  if (existing) return existing.device_id;

  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`);
  await tx.store.put({
    device_id: id,
    created_at: Date.now(),
  });
  await tx.done;
  return id;
}

export async function enqueueScan(
  scan: Omit<PendingScan, "attempts" | "last_error" | "created_at">,
): Promise<void> {
  const db = await getDb();
  await db.put("pending_scans", {
    ...scan,
    attempts: 0,
    last_error: null,
    created_at: Date.now(),
  });
}

export async function pendingScansForCount(
  inventoryCountId: string,
): Promise<PendingScan[]> {
  const db = await getDb();
  return db.getAllFromIndex("pending_scans", "by-count", inventoryCountId);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.count("pending_scans");
}

export async function allPendingScans(): Promise<PendingScan[]> {
  const db = await getDb();
  return db.getAll("pending_scans");
}

export async function markSynced(
  offlineScanId: string,
  scan: PendingScan,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["pending_scans", "synced_scans"], "readwrite");
  await tx.objectStore("pending_scans").delete(offlineScanId);
  await tx.objectStore("synced_scans").put({ ...scan, synced_at: Date.now() });
  await tx.done;
}

export async function recordSyncError(
  offlineScanId: string,
  error: string,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("pending_scans", offlineScanId);
  if (!existing) return;
  await db.put("pending_scans", {
    ...existing,
    attempts: existing.attempts + 1,
    last_error: error,
  });
}

/**
 * Limpia scans sincronizados con > 7 días — evita que IndexedDB crezca sin límite.
 */
export async function pruneSynced(maxAgeMs = 7 * 24 * 3600 * 1000) {
  const db = await getDb();
  const cutoff = Date.now() - maxAgeMs;
  const tx = db.transaction("synced_scans", "readwrite");
  const oldKeys = await tx.store
    .index("by-synced")
    .getAllKeys(IDBKeyRange.upperBound(cutoff));
  await Promise.all(oldKeys.map((k) => tx.store.delete(k)));
  await tx.done;
}
