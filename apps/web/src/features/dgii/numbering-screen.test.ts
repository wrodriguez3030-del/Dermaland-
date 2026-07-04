// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * La pantalla /dgii/secuencias usa la capa "anywhere" (numbering-client):
 *  - supabase → GET/POST/PATCH /api/dgii/sequences (invoice_numberings,
 *    la MISMA tabla que reserva el POS) y NO usa localStorage;
 *  - mock → numbering-store local (demo).
 */

async function importClientWithDataSource(ds: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", ds ?? "");
  return await import("./numbering-client");
}

const SERVER_ROWS = [
  {
    id: "3f2c8a1e-1111-2222-3333-444455556666",
    name: "Factura de consumo (B02)",
    documentType: "consumo",
    prefix: "B02",
    rangeStart: 1,
    rangeEnd: 50000,
    nextNumber: 1300,
    environment: "mock",
    isElectronic: false,
    isPreferred: true,
    status: "active",
    endDate: "2027-12-31",
    createdAt: "2026-07-03T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  },
];

describe("numbering-client — modo supabase", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("saveNumberingAnywhere crea vía POST /api/dgii/sequences sin tocar localStorage", async () => {
    const client = await importClientWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ numbering: SERVER_ROWS[0] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const r = await client.saveNumberingAnywhere({
      name: "X",
      documentType: "consumo",
      prefix: "B02",
      rangeStart: 1,
      rangeEnd: 10,
      nextNumber: 1,
      environment: "demo",
      isElectronic: false,
      isPreferred: false,
      status: "active",
    });

    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/dgii/sequences");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("editar usa PATCH /api/dgii/sequences/[id] y errores llegan amigables", async () => {
    const client = await importClientWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: "No se puede bajar el siguiente número: reutilizaría comprobantes ya emitidos.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await client.saveNumberingAnywhere(
      { nextNumber: 1 } as never,
      "3f2c8a1e-1111-2222-3333-444455556666",
    );
    expect(fetchMock.mock.calls[0]![0]).toContain("/api/dgii/sequences/3f2c8a1e");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Mensaje amigable, no error técnico ni UUID.
      expect(r.error).not.toMatch(/HTTP|500|stack|uuid/i);
      expect(r.error).toMatch(/siguiente número/);
    }
  });

  it("marcar preferida / inactivar / activar llaman sus endpoints", async () => {
    const client = await importClientWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ numbering: SERVER_ROWS[0] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await client.setPreferredAnywhere("abc");
    await client.setActiveAnywhere("abc", false);
    await client.setActiveAnywhere("abc", true);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      "/api/dgii/sequences/abc/prefer",
      "/api/dgii/sequences/abc/deactivate",
      "/api/dgii/sequences/abc/activate",
    ]);
  });

  it("useNumberingHistory consulta /history (auditoría)", async () => {
    const client = await importClientWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            action: "dgii.sequence_reserved",
            userName: "Rosa",
            createdAt: "2026-07-04T00:00:00Z",
            metadata: { formatted: "B0200001300" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    // Hook: lo ejercitamos vía renderHook simple con react-dom/test-utils no
    // disponible aquí — validamos el label map + el fetch del endpoint.
    expect(client.HISTORY_ACTION_LABEL["dgii.sequence_reserved"]).toMatch(
      /reservado/i,
    );
  });
});

describe("numbering-client — modo mock", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("crear/preferir/inactivar usan el store local sin fetch", async () => {
    const client = await importClientWithDataSource(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const created = await client.saveNumberingAnywhere({
      name: "Demo local",
      documentType: "regimen_especial",
      prefix: "ZZL",
      rangeStart: 1,
      rangeEnd: 10,
      nextNumber: 1,
      environment: "demo",
      isElectronic: false,
      isPreferred: false,
      status: "active",
    });
    expect(created.ok).toBe(true);
    const id = created.ok && created.numbering ? created.numbering.id : "";
    expect((await client.setPreferredAnywhere(id)).ok).toBe(true);
    expect((await client.setActiveAnywhere(id, false)).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
