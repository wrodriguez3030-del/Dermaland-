import { describe, it, expect } from "vitest";
import { listTargetTables } from "../../../../scripts/backup/lib/list-target-tables.mjs";

function fakeWarn() {
  const mensajes: string[] = [];
  const warn = (msg: string) => mensajes.push(msg);
  return { warn, mensajes };
}

describe("listTargetTables", () => {
  it("devuelve los nombres de tabla del spec OpenAPI, sin avisar (chequeo corrió y encontró tablas)", async () => {
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ definitions: { businesses: {}, proformas: {} } }),
    });
    const tablas = await listTargetTables({ url: "https://x.supabase.co", key: "k", fetchImpl, warn });
    expect(tablas.sort()).toEqual(["businesses", "proformas"]);
    expect(mensajes).toEqual([]);
  });

  it("destino genuinamente vacío (definitions: {}) — silencioso, no es una falla", async () => {
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ definitions: {} }),
    });
    const tablas = await listTargetTables({ url: "https://x.supabase.co", key: "k", fetchImpl, warn });
    expect(tablas).toEqual([]);
    expect(mensajes).toEqual([]);
  });

  it("HTTP no-ok (ej. 401/403): devuelve [] y AVISA — el chequeo no corrió", async () => {
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const tablas = await listTargetTables({ url: "https://x.supabase.co", key: "bad", fetchImpl, warn });
    expect(tablas).toEqual([]);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatch(/no se pudo/i);
    expect(mensajes[0]).toMatch(/DERMALAND_DR_CONFIRM/);
  });

  it("fetch lanza (red caída / host inexistente): devuelve [] y AVISA", async () => {
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const tablas = await listTargetTables({ url: "https://no-existe.example", key: "k", fetchImpl, warn });
    expect(tablas).toEqual([]);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatch(/no se pudo/i);
  });

  it("respuesta OK pero sin forma OpenAPI (self-hosted que responde distinto a Supabase Cloud): devuelve [] y AVISA", async () => {
    // Este es el caso que la ronda de corrección 1 señaló como no probado:
    // el endpoint solo se verificó contra Supabase Cloud. Un gateway
    // self-hosted que responda JSON pero sin `definitions` (por ejemplo, un
    // mensaje de error propio del proxy) no debe interpretarse como "destino
    // vacío, seguro escribir".
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: "algo distinto, no es el spec OpenAPI" }),
    });
    const tablas = await listTargetTables({ url: "https://self-hosted.example", key: "k", fetchImpl, warn });
    expect(tablas).toEqual([]);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatch(/no se pudo/i);
  });

  it("respuesta OK pero no es JSON válido: devuelve [] y AVISA", async () => {
    const { warn, mensajes } = fakeWarn();
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    const tablas = await listTargetTables({ url: "https://raro.example", key: "k", fetchImpl, warn });
    expect(tablas).toEqual([]);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatch(/no se pudo/i);
  });
});
