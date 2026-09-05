import { describe, it, expect, vi } from "vitest";
import { AlegraClient, AlegraAuthError, AlegraHttpError } from "./client";

function fakeFetch(
  handler: (url: string, n: number) => { status: number; body: unknown; headers?: Record<string, string> },
) {
  let n = 0;
  const calls: string[] = [];
  const inits: RequestInit[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    inits.push(init ?? {});
    if (init?.method && init.method !== "GET") throw new Error(`método prohibido: ${init.method}`);
    const r = handler(url, n++);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  });
  return { f: f as unknown as typeof fetch, calls, inits };
}
const noSleep = async () => {};

describe("AlegraClient", () => {
  it("manda Basic base64(email:token) y solo GET", async () => {
    const { f, calls, inits } = fakeFetch(() => ({ status: 200, body: { name: "DermaLand" } }));
    const c = new AlegraClient({ email: "a@b.com", token: "t0k", fetchImpl: f, sleep: noSleep });
    const r = await c.get<{ name: string }>("company");
    expect(r.name).toBe("DermaLand");
    expect(calls[0]).toBe("https://api.alegra.com/api/v1/company");
    expect((inits[0]!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("a@b.com:t0k").toString("base64")}`,
    );
    expect(inits[0]!.method).toBe("GET");
  });

  it("pagina de 30 en 30 hasta página incompleta y NO usa metadata.total", async () => {
    const { f, calls } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      const size = start === 60 ? 5 : 30;
      return { status: 200, body: Array.from({ length: size }, (_, i) => ({ id: String(start + i) })) };
    });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    const pages: number[] = [];
    const rows = await c.listAll<{ id: string }>("items", { status: "active" }, (p, s) => {
      pages.push(s);
    });
    expect(rows).toHaveLength(65);
    expect(pages).toEqual([0, 30, 60]);
    expect(calls).toHaveLength(3);
    expect(new URL(calls[0]!).searchParams.get("limit")).toBe("30");
    expect(new URL(calls[0]!).searchParams.get("status")).toBe("active");
  });

  // 2026-09-05, visto en producción: la paginación de Alegra REPITE registros
  // (el ítem 1076 vino dos veces en 1487). Sin deduplicar, el segundo se creaba
  // como producto nuevo y el enlace del primero moría con clave duplicada.
  // 2026-09-05: sin ordenar, la paginación de Alegra no solo REPITE — también
  // PIERDE. La lectura de ítems devolvía 1486 únicos de 1487: el 1076 dos veces
  // y el 1115 ninguna. Ordenando por id salen los 1487 exactos.
  it("pagina ordenando por id, que es la única clave total (el llamador puede cambiarlo)", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, body: [] }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    await c.listAll("items");
    expect(new URL(calls[0]!).searchParams.get("order_field")).toBe("id");
    expect(new URL(calls[0]!).searchParams.get("order_direction")).toBe("ASC");
    await c.listAll("invoices", { order_field: "date" });
    expect(new URL(calls[1]!).searchParams.get("order_field")).toBe("date");
  });

  it("deduplica por id: un registro repetido entre páginas se devuelve una sola vez", async () => {
    const { f } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      if (start === 0) return { status: 200, body: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })) };
      if (start === 30) return { status: 200, body: [{ id: "5" }, { id: "30" }] };
      return { status: 200, body: [] };
    });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    const vistasEnPagina: string[][] = [];
    const rows = await c.listAll<{ id: string }>("items", {}, (p) => {
      vistasEnPagina.push(p.map((r) => r.id));
    });
    expect(rows).toHaveLength(31);
    expect(rows.filter((r) => r.id === "5")).toHaveLength(1);
    // onPage tampoco ve el repetido: quien escribe por lotes no lo duplica.
    expect(vistasEnPagina[1]).toEqual(["30"]);
  });

  it("una página llena de repetidos no corta la paginación antes de tiempo", async () => {
    const { f, calls } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      if (start === 0) return { status: 200, body: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })) };
      if (start === 30) return { status: 200, body: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })) };
      return { status: 200, body: [{ id: "99" }] };
    });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    const rows = await c.listAll<{ id: string }>("items");
    expect(calls).toHaveLength(3);
    expect(rows).toHaveLength(31);
  });

  it("espera a que onPage termine antes de pedir la siguiente página (onPage async)", async () => {
    const { f } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      return { status: 200, body: start === 0 ? Array(30).fill({ id: "x" }) : [] };
    });
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    const orden: string[] = [];
    await c.listAll("items", {}, async (_rows, start) => {
      orden.push(`inicio-${start}`);
      await new Promise((r) => setTimeout(r, 5));
      orden.push(`fin-${start}`);
    });
    expect(orden).toEqual(["inicio-0", "fin-0", "inicio-30", "fin-30"]);
  });

  it("ante 429 espera X-Rate-Limit-Reset segundos y reintenta", async () => {
    const waited: number[] = [];
    const { f } = fakeFetch((_, n) =>
      n === 0
        ? { status: 429, body: { message: "Too Many request" }, headers: { "X-Rate-Limit-Reset": "2" } }
        : { status: 200, body: [] },
    );
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: f,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await c.listAll("items");
    expect(waited).toEqual([2000]);
  });

  // 2026-09-05, visto en producción: al pasarse del límite Alegra NO responde
  // 429, responde 400 con {"code":429,"message":"Too many requests"} en el
  // cuerpo. Y el límite real de la cuenta es 100/min, no 150.
  it("trata un 400 con code 429 en el cuerpo como límite alcanzado: espera el reset y reintenta", async () => {
    const waited: number[] = [];
    const { f, calls } = fakeFetch((_, n) =>
      n === 0
        ? {
            status: 400,
            body: { code: 429, message: "Too many requests", headers: { "x-rate-limit-reset": 7 } },
          }
        : { status: 200, body: { ok: true } },
    );
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: f,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await c.get("company");
    expect(calls).toHaveLength(2);
    expect(waited).toContain(7000);
  });

  it("espacia las peticiones según x-rate-limit-limit para no disparar el corte por ráfaga", async () => {
    const waited: number[] = [];
    const { f } = fakeFetch((url) => {
      const start = Number(new URL(url).searchParams.get("start") ?? 0);
      return {
        status: 200,
        body: start === 0 ? Array(30).fill({ id: "x" }) : [],
        headers: { "x-rate-limit-limit": "100", "x-rate-limit-remaining": "99", "x-rate-limit-reset": "60" },
      };
    });
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: f,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await c.listAll("items");
    // La segunda petición espera ~60000/100 = 600 ms desde la primera.
    expect(waited.some((ms) => ms >= 500 && ms <= 700)).toBe(true);
  });

  it("frena también cuando X-Rate-Limit-Remaining llega a 0", async () => {
    const waited: number[] = [];
    const { f } = fakeFetch((_, n) => ({
      status: 200,
      body: n === 0 ? Array(30).fill({ id: "x" }) : [],
      headers: (n === 0 ? { "X-Rate-Limit-Remaining": "0", "X-Rate-Limit-Reset": "3" } : {}) as Record<string, string>,
    }));
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: f,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await c.listAll("items");
    expect(waited).toEqual([3000]);
  });

  it("reintenta 5xx tres veces con espera creciente y luego falla con AlegraHttpError", async () => {
    const waited: number[] = [];
    const { f, calls } = fakeFetch(() => ({ status: 502, body: { message: "bad gateway" } }));
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: f,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await expect(c.get("company")).rejects.toBeInstanceOf(AlegraHttpError);
    expect(calls).toHaveLength(4);
    expect(waited).toEqual([1000, 2000, 4000]);
  });

  it("401 es AlegraAuthError y no se reintenta", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 401, body: { message: "Unauthorized" } }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    await expect(c.get("company")).rejects.toBeInstanceOf(AlegraAuthError);
    expect(calls).toHaveLength(1);
  });

  it("cuenta las peticiones hechas", async () => {
    const { f } = fakeFetch(() => ({ status: 200, body: [] }));
    const c = new AlegraClient({ email: "a", token: "b", fetchImpl: f, sleep: noSleep });
    await c.listAll("items");
    await c.get("company");
    expect(c.requests).toBe(2);
  });

  it("no expone ningún método de escritura", () => {
    const c = new AlegraClient({
      email: "a",
      token: "b",
      fetchImpl: fakeFetch(() => ({ status: 200, body: {} })).f,
      sleep: noSleep,
    });
    const nombres = Object.getOwnPropertyNames(Object.getPrototypeOf(c));
    expect(nombres.some((n) => /post|put|patch|delete|create|update|remove/i.test(n))).toBe(false);
  });
});
