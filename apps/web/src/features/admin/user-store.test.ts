// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function importStore(ds: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", ds ?? "");
  return await import("./user-store");
}

describe("user-store — modo supabase", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("saveUser crea vía POST /api/users", async () => {
    const store = await importStore("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", fullName: "Rosa" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await store.saveUser({
      fullName: "Rosa",
      email: "rosa@x.do",
      role: "vendedor",
      branchIds: [],
    });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/users");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("editar usa PATCH /api/users/[id]", async () => {
    const store = await importStore("supabase");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await store.saveUser(
      { fullName: "Rosa", email: "rosa@x.do", role: "cashier", branchIds: [] },
      "u1",
    );
    expect(fetchMock.mock.calls[0]![0]).toContain("/api/users/u1");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
  });

  it("setUserStatus desactiva vía PATCH status", async () => {
    const store = await importStore("supabase");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await store.setUserStatus("u1", "disabled");
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ status: "disabled" });
  });

  it("error del servidor llega amigable, sin detalles técnicos", async () => {
    const store = await importStore("supabase");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: "Ya existe un usuario con ese email." }),
      }),
    );
    const r = await store.saveUser({
      fullName: "X",
      email: "dup@x.do",
      role: "vendedor",
      branchIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("email");
  });
});

describe("user-store — modo mock", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("saveUser en local informa que no persiste", async () => {
    const store = await importStore(undefined);
    const r = await store.saveUser({
      fullName: "X",
      email: "x@x.do",
      role: "vendedor",
      branchIds: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/demo|Supabase/i);
  });
});
