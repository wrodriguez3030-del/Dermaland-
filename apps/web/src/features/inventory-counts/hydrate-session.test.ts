import { describe, it, expect, vi } from "vitest";
import { hydrateSessionFromServer } from "./hydrate-session";

const RESPUESTA = {
  count: {
    id: "srv-1",
    countNumber: "CONT-7",
    branchId: "br1",
    warehouseId: "wh1",
    countType: "full",
    status: "in_progress",
    startedAt: "2026-08-03T00:00:00Z",
    notes: null,
  },
  items: [
    {
      productId: "p1",
      productSku: "SKU-1",
      productName: "Producto 1",
      countedQuantity: 3,
      lastScanAt: "2026-08-03T01:00:00Z",
    },
  ],
  scans: [],
};

describe("hydrateSessionFromServer", () => {
  it("convierte la respuesta del servidor en una sesión local", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(RESPUESTA), { status: 200 })),
    );

    const s = await hydrateSessionFromServer("srv-1");
    expect(s?.serverId).toBe("srv-1");
    expect(s?.serverWarehouseId).toBe("wh1");
    expect(s?.code).toBe("CONT-7");
    expect(s?.items).toEqual([
      {
        productId: "p1",
        sku: "SKU-1",
        productName: "Producto 1",
        countedQuantity: 3,
        lastScannedAt: "2026-08-03T01:00:00Z",
      },
    ]);
  });

  it("un conteo aprobado llega como aprobado y no se puede seguir contando", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...RESPUESTA,
              count: { ...RESPUESTA.count, status: "approved" },
            }),
            { status: 200 },
          ),
      ),
    );
    expect((await hydrateSessionFromServer("srv-1"))?.status).toBe("approved");
  });

  it("devuelve null si el conteo no existe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await hydrateSessionFromServer("nope")).toBeNull();
  });

  it("devuelve null sin lanzar si la red falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red");
      }),
    );
    expect(await hydrateSessionFromServer("x")).toBeNull();
  });
});
