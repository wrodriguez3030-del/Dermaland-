// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests del cableado POS → reserva atómica en servidor.
 *
 * En modo supabase, `reserveNextPreferredAnywhere`:
 *  - llama a POST /api/dgii/sequences/reserve,
 *  - NO toca localStorage (la numeración fiscal es compartida entre cajas),
 *  - NO cae al store local si el servidor falla (numerar por navegador
 *    duplicaría comprobantes),
 *  - nunca pide ambiente `produccion`,
 *  - proforma NUNCA consume secuencia fiscal del servidor.
 */

async function importStoreWithDataSource(ds: string | undefined) {
  vi.resetModules();
  if (ds === undefined) {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", ds);
  }
  return await import("./numbering-store");
}

describe("reserveNextPreferredAnywhere — modo supabase", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reserva vía POST /api/dgii/sequences/reserve con docType/env/branch/cashier", async () => {
    const store = await importStoreWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sequenceId: "num_uuid_1",
        docType: "consumo",
        number: 1300,
        formatted: "B0200001300",
        environment: "mock",
        remaining: 48700,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await store.reserveNextPreferredAnywhere("consumo", "mock", {
      branchId: "br_1",
      cashierId: "usr_1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/dgii/sequences/reserve");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      docType: "consumo",
      environment: "mock",
      branchId: "br_1",
      cashierId: "usr_1",
    });
    expect(r).toEqual({
      ok: true,
      formatted: "B0200001300",
      value: 1300,
      numberingId: "num_uuid_1",
      environment: "mock",
      source: "server",
    });
  });

  it("B02→consumo, B01→credito_fiscal, E32→ecf_32, E31→ecf_31 (formato del server)", async () => {
    const store = await importStoreWithDataSource("supabase");
    const cases = [
      { docType: "consumo" as const, formatted: "B0200001300" },
      { docType: "credito_fiscal" as const, formatted: "B0100000400" },
      { docType: "ecf_32" as const, formatted: "E3200000150" },
      { docType: "ecf_31" as const, formatted: "E3100000100" },
    ];
    for (const c of cases) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sequenceId: "x",
          docType: c.docType,
          number: 1,
          formatted: c.formatted,
          environment: "mock",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const r = await store.reserveNextPreferredAnywhere(c.docType, "mock");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.formatted).toBe(c.formatted);
        // El prefijo del comprobante corresponde al tipo pedido.
        expect(
          JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
            .docType,
        ).toBe(c.docType);
      }
    }
  });

  it("NO toca localStorage al reservar en servidor", async () => {
    const store = await importStoreWithDataSource("supabase");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sequenceId: "x",
          number: 5,
          formatted: "B0200000005",
          environment: "mock",
        }),
      }),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await store.reserveNextPreferredAnywhere("consumo", "mock");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("si el servidor falla NO cae al store local (aborta con error)", async () => {
    const store = await importStoreWithDataSource("supabase");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "La numeración se agotó." }),
      }),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const r = await store.reserveNextPreferredAnywhere("consumo", "mock");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("agotó");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("error de red → ok:false sin fallback local", async () => {
    const store = await importStoreWithDataSource("supabase");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await store.reserveNextPreferredAnywhere("consumo", "mock");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("offline");
  });

  it("nunca pide ambiente produccion al servidor", async () => {
    const store = await importStoreWithDataSource("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sequenceId: "x",
        number: 1,
        formatted: "B0200000001",
        environment: "mock",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await store.reserveNextPreferredAnywhere("consumo", "produccion");
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.environment).toBeUndefined();
  });

  it("proforma NO consume secuencia fiscal del servidor (usa store local)", async () => {
    const store = await importStoreWithDataSource("supabase");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await store.reserveNextPreferredAnywhere("proforma", "mock");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("local");
      expect(r.formatted).toMatch(/^PROF-/);
    }
  });
});

describe("reserveNextPreferredAnywhere — modo local (mock/demo)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("usa el store localStorage y lo marca source=local", async () => {
    const store = await importStoreWithDataSource(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await store.reserveNextPreferredAnywhere("consumo", "mock");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("local");
      expect(r.formatted).toMatch(/^B02/);
    }
  });

  it("dos reservas locales consecutivas no repiten número", async () => {
    const store = await importStoreWithDataSource(undefined);
    const a = await store.reserveNextPreferredAnywhere("consumo", "mock");
    const b = await store.reserveNextPreferredAnywhere("consumo", "mock");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.formatted).not.toBe(b.formatted);
      expect(b.value).toBe(a.value + 1);
    }
  });
});
