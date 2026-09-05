import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { entidadesValidas } from "./dispatch";

describe("entidadesValidas", () => {
  it("acepta la lista conocida y rechaza cualquier otra cosa", () => {
    expect(entidadesValidas("contacts,items,stock,invoices")).toBe(true);
    expect(entidadesValidas("items")).toBe(true);
    expect(entidadesValidas("items, stock")).toBe(true);
    expect(entidadesValidas("items;rm -rf /")).toBe(false);
    expect(entidadesValidas("todo")).toBe(false);
    expect(entidadesValidas("")).toBe(false);
  });
});

describe("dispararSincronizacion", () => {
  const OLD = process.env.GITHUB_ACTIONS_TOKEN;
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.GITHUB_ACTIONS_TOKEN;
    else process.env.GITHUB_ACTIONS_TOKEN = OLD;
  });

  it("sin token no llama a GitHub y explica por qué", async () => {
    delete process.env.GITHUB_ACTIONS_TOKEN;
    const { dispararSincronizacion } = await import("./dispatch");
    const f = vi.fn();
    const r = await dispararSincronizacion({ fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(f).not.toHaveBeenCalled();
  });

  it("con token manda el workflow_dispatch con los inputs correctos", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "tok";
    const { dispararSincronizacion } = await import("./dispatch");
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const r = await dispararSincronizacion({
      modo: "full",
      entidades: "items,stock",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/actions/workflows/alegra-sync.yml/dispatches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      ref: "main",
      inputs: { modo: "full", entidades: "items,stock", simulacion: false },
    });
  });

  it("rechaza entidades inventadas sin llamar a GitHub", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "tok";
    const { dispararSincronizacion } = await import("./dispatch");
    const f = vi.fn();
    const r = await dispararSincronizacion({ entidades: "borrar-todo", fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it("traduce el 403 de GitHub a un mensaje sobre el permiso del token", async () => {
    process.env.GITHUB_ACTIONS_TOKEN = "tok";
    const { dispararSincronizacion } = await import("./dispatch");
    const f = vi.fn(async () => new Response("no", { status: 403 }));
    const r = await dispararSincronizacion({ fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect((r as { message: string }).message).toMatch(/actions: write/);
  });
});
