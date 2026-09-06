import { describe, it, expect, vi } from "vitest";
import { crearRepositorioSecuencias } from "./dgii-sequences";

/** Cliente de mentira: solo registra qué RPC se llamó y con qué. */
function clienteFalso(respuesta: unknown, error: unknown = null) {
  const llamadas: Array<{ fn: string; args: unknown }> = [];
  return {
    llamadas,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      llamadas.push({ fn, args });
      return { data: respuesta, error };
    }),
  };
}

describe("repositorio de secuencias fiscales", () => {
  it("peek pide el número sin consumirlo", async () => {
    const c = clienteFalso("E320000000007");
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    expect(await repo.peekNextEncf("32", "testecf")).toBe("E320000000007");
    expect(c.llamadas[0]).toEqual({
      fn: "peek_next_encf",
      args: { p_business_id: "biz-1", p_tipo_ecf: "32", p_ambiente: "testecf" },
    });
  });

  it("preparar devuelve el conflicto tal cual, sin convertirlo en excepción", async () => {
    // Una carrera NO es un error: la fase 3 tiene que poder reintentar.
    const c = clienteFalso({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    const r = await repo.prepararFactura("E320000000007", { tipo_ecf: "32", ambiente: "testecf" }, []);
    expect(r).toEqual({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" });
  });

  it("un error de la base SÍ es excepción, y no se traga", async () => {
    const c = clienteFalso(null, { message: "no hay secuencia activa", code: "P0002" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    await expect(repo.peekNextEncf("32", "testecf")).rejects.toThrow(/no hay secuencia activa/);
  });

  it("el business_id lo pone el repositorio, nunca quien llama", async () => {
    const c = clienteFalso({ ok: true, invoice_id: "f-1", e_ncf: "E320000000007" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    // Aunque el llamador meta otro business_id en la factura, gana el del repositorio.
    await repo.prepararFactura("E320000000007", { tipo_ecf: "32", ambiente: "testecf", business_id: "OTRA" } as never, []);
    // ! La prueba garantiza que hay al menos una llamada, así que c.llamadas[0] no es undefined
    expect((c.llamadas[0]!.args as { p_business_id: string }).p_business_id).toBe("biz-1");
  });

  it("marcarFallo devuelve {ok: false} si la factura no existe", async () => {
    // fail_ecf_invoice ahora comprueba row_count y puede devolver FACTURA_NO_ENCONTRADA.
    const c = clienteFalso({ ok: false, motivo: "FACTURA_NO_ENCONTRADA" });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    const r = await repo.marcarFallo("inv-123", "TEST_MOTIVO");
    expect(r).toEqual({ ok: false, motivo: "FACTURA_NO_ENCONTRADA" });
  });

  it("marcarFallo devuelve {ok: true} si el marcado fue exitoso", async () => {
    const c = clienteFalso({ ok: true });
    const repo = crearRepositorioSecuencias(c as never, "biz-1");
    const r = await repo.marcarFallo("inv-123", "TEST_MOTIVO");
    expect(r).toEqual({ ok: true });
  });
});
