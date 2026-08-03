import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureServerCount } from "./ensure-server-count";

const sesion = {
  id: "loc-1",
  code: "CONT-1",
  name: "Conteo",
  branchId: "br1",
  type: "full",
  status: "in_progress",
  startedAt: "2026-08-03T00:00:00Z",
  items: [],
  scans: [],
  createdAt: "2026-08-03T00:00:00Z",
  updatedAt: "2026-08-03T00:00:00Z",
} as never;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ensureServerCount", () => {
  it("crea la cabecera y devuelve el id del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ count: { id: "srv-1", warehouseId: "wh-1" } }),
            { status: 201 },
          ),
      ),
    );
    expect(await ensureServerCount(sesion)).toEqual({ id: "srv-1", warehouseId: "wh-1" });
  });

  it("la cabecera nace en curso y sin ítems", async () => {
    const espia = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(JSON.stringify({ count: { id: "srv-1" } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", espia);
    await ensureServerCount(sesion);
    const body = JSON.parse(String(espia.mock.calls[0]![1]?.body));
    expect(body.status).toBe("in_progress");
    expect(body.items).toEqual([]);
  });

  it("devuelve null cuando el backend está en modo mock (409)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 409 })));
    expect(await ensureServerCount(sesion)).toBeNull();
  });

  it("devuelve null si la red falla, sin lanzar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sin red");
      }),
    );
    expect(await ensureServerCount(sesion)).toBeNull();
  });

  it("no vuelve a crear si la sesión ya tiene serverId", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(
      await ensureServerCount({
        ...(sesion as object),
        serverId: "srv-9",
        serverWarehouseId: "wh-9",
      } as never),
    ).toEqual({ id: "srv-9", warehouseId: "wh-9" });
    expect(spy).not.toHaveBeenCalled();
  });
});
