import type { CountSession, CountSessionStatus } from "./scan-session-store";

/** El conteo de la nube solo puede volver como en curso o ya cerrado. */
function estadoLocal(status: string): CountSessionStatus {
  if (status === "approved" || status === "adjusted") return "approved";
  if (status === "cancelled" || status === "rejected") return "cancelled";
  if (status === "submitted" || status === "reviewed") return "reviewing";
  return "in_progress";
}

/**
 * Reconstruye una sesión local desde el conteo guardado en Supabase. Sirve para
 * continuar un conteo empezado en otro dispositivo o recuperado tras limpiar el
 * navegador. Nunca lanza: sin red devuelve null y la pantalla decide qué mostrar.
 *
 * Los escaneos no se rehidratan: el acumulado por producto ya vive en los
 * ítems, y la bitácora de escaneos es del dispositivo que los hizo.
 */
export async function hydrateSessionFromServer(
  countId: string,
): Promise<CountSession | null> {
  try {
    const res = await fetch(`/api/inventory-counts/${countId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      count: {
        id: string;
        countNumber: string;
        branchId: string;
        warehouseId?: string;
        countType: CountSession["type"];
        status: string;
        startedAt: string;
        notes: string | null;
      };
      items: Array<{
        productId: string;
        productSku: string;
        productName: string;
        countedQuantity: number;
        lastScanAt: string | null;
      }>;
    };
    const ahora = new Date().toISOString();
    return {
      id: data.count.id,
      serverId: data.count.id,
      serverWarehouseId: data.count.warehouseId,
      code: data.count.countNumber,
      name: data.count.countNumber,
      branchId: data.count.branchId,
      type: data.count.countType,
      status: estadoLocal(data.count.status),
      notes: data.count.notes ?? undefined,
      startedAt: data.count.startedAt,
      items: data.items.map((it) => ({
        productId: it.productId,
        sku: it.productSku,
        productName: it.productName,
        countedQuantity: it.countedQuantity,
        lastScannedAt: it.lastScanAt ?? data.count.startedAt,
      })),
      scans: [],
      createdAt: data.count.startedAt,
      updatedAt: ahora,
    };
  } catch {
    return null;
  }
}
