import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reserveProformaNumber } from "./proforma-number";

/**
 * La propiedad que se defiende aquí es una sola y es de seguridad operativa:
 * cuando el servidor no da número, la venta se PARA. Volver al contador del
 * navegador sería volver justo al fallo que esto arregla —dos cajas pidiendo el
 * mismo número— pero con peor pinta, porque el cajero creería que cobró.
 */
describe("reserveProformaNumber", () => {
  const envOriginal = process.env.NEXT_PUBLIC_DATA_SOURCE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = "supabase";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = envOriginal;
    vi.unstubAllGlobals();
  });

  it("devuelve el número que reservó la base", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ number: "PROF-2026-000196" }),
      }),
    );
    await expect(reserveProformaNumber()).resolves.toEqual({
      ok: true,
      number: "PROF-2026-000196",
    });
  });

  it("falla —no inventa un número— si el servidor responde error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "No disponible." }),
      }),
    );
    const r = await reserveProformaNumber();
    expect(r.ok).toBe(false);
  });

  it("falla si el servidor contesta 200 pero sin número", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    expect((await reserveProformaNumber()).ok).toBe(false);
  });

  it("falla si se cae la conexión, en vez de caer al contador local", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await reserveProformaNumber();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("conexión");
  });

  it("en modo mock no llama al servidor: ahí no hay servidor que llamar", async () => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = "mock";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await reserveProformaNumber();
    expect(r.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
