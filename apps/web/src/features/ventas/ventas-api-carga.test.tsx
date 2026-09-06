// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useResumenVentas } from "./ventas-api";

/**
 * Los tres estados de la carga de `/api/ventas` y —lo que de verdad importa—
 * lo que NUNCA puede pasar: que una respuesta obsoleta o a medias se guarde
 * como buena y la pantalla enseñe RD$0.00 como si fuera el total.
 *
 * El bug que cierra la última prueba: si el aborto llega DESPUÉS de las
 * cabeceras y mientras se lee el cuerpo, `res.json()` rechaza con AbortError,
 * pero `res.ok` ya vale `true`. Tragarse ese error dejaba `json = null`, que se
 * interpreta como «cero ventas», y eso se guardaba en estado «listo».
 */

/** Respuesta falsa cuyo cuerpo se resuelve (o rechaza) cuando la prueba quiera. */
function respuestaConCuerpoAbierto(ok = true, status = 200) {
  let resolver!: (v: unknown) => void;
  let rechazar!: (e: unknown) => void;
  const cuerpo = new Promise<unknown>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { res: { ok, status, json: () => cuerpo }, resolver, rechazar };
}

const RESUMEN_REAL = {
  resumen: {
    total: 48454899.08,
    cantidad: 14743,
    porOrigen: {
      sistema: { total: 0, cantidad: 0 },
      alegra: { total: 48454899.08, cantidad: 14743 },
    },
  },
};

/** Deja correr las microtareas pendientes dentro de `act`. */
const dejarCorrer = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("carga del resumen de ventas", () => {
  it("empieza cargando: nunca un cero que parezca un dato", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useResumenVentas({}));
    expect(result.current.tipo).toBe("cargando");
  });

  it("con la respuesta buena pasa a listo con el histórico completo", async () => {
    const { res, resolver } = respuestaConCuerpoAbierto();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)));
    const { result } = renderHook(() => useResumenVentas({}));
    await act(async () => {
      resolver(RESUMEN_REAL);
      await Promise.resolve();
    });
    await dejarCorrer();
    expect(result.current.tipo).toBe("listo");
    if (result.current.tipo === "listo") {
      expect(result.current.datos.porOrigen.alegra.cantidad).toBe(14743);
    }
  });

  it("con un 400 pasa a error con el mensaje del servidor, no a un cero", async () => {
    // Es el camino REAL de hoy: `?vista=resumen` responde 400 hasta que se
    // aplique la migración `20260906130000_resumen_ventas_unificadas.sql`.
    const { res, resolver } = respuestaConCuerpoAbierto(false, 400);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)));
    const { result } = renderHook(() => useResumenVentas({}));
    await act(async () => {
      resolver({ error: "La función resumen_ventas_unificadas no existe." });
      await Promise.resolve();
    });
    await dejarCorrer();
    expect(result.current.tipo).toBe("error");
    if (result.current.tipo === "error") {
      expect(result.current.mensaje).toContain("resumen_ventas_unificadas");
    }
  });

  it("🔴 abortar a mitad del CUERPO no puede dejar un RD$0.00 en estado listo", async () => {
    // Pasa al cambiar de periodo o de sucursal con una petición en vuelo: la
    // vieja se aborta cuando ya mandó las cabeceras. Sin la guarda por
    // `signal.aborted`, esa respuesta muerta se guardaba como buena y la
    // pantalla enseñaba cero ventas —sin aviso— hasta que llegara la nueva.
    const primera = respuestaConCuerpoAbierto();
    const segunda = respuestaConCuerpoAbierto();
    const llamadas = [primera, segunda];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(llamadas[i++]!.res)),
    );

    const { result, rerender } = renderHook(
      ({ sucursalId }: { sucursalId: string }) => useResumenVentas({ sucursalId }),
      { initialProps: { sucursalId: "sucursal-1" } },
    );
    await dejarCorrer();

    // El usuario cambia de sucursal: la petición en vuelo se aborta.
    rerender({ sucursalId: "sucursal-2" });
    await dejarCorrer();

    // El cuerpo de la PRIMERA petición muere a medias, ya abortada.
    await act(async () => {
      primera.rechazar(new DOMException("The user aborted a request.", "AbortError"));
      await Promise.resolve();
    });
    await dejarCorrer();

    // La respuesta muerta no manda: se sigue esperando a la nueva.
    expect(result.current.tipo).toBe("cargando");

    // Y cuando llega la buena, se ve entera.
    await act(async () => {
      segunda.resolver(RESUMEN_REAL);
      await Promise.resolve();
    });
    await dejarCorrer();
    expect(result.current.tipo).toBe("listo");
    if (result.current.tipo === "listo") {
      expect(result.current.datos.porOrigen.alegra.total).toBeCloseTo(48454899.08, 2);
    }
  });

  it("🔴 una respuesta que llega tarde tampoco pisa a la nueva", async () => {
    // Misma familia: el cuerpo de la vieja se lee ENTERO justo después del
    // aborto. `res.ok` es true y el JSON es válido; lo único que la descarta
    // es la guarda por `signal.aborted`.
    const primera = respuestaConCuerpoAbierto();
    const segunda = respuestaConCuerpoAbierto();
    const llamadas = [primera, segunda];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(llamadas[i++]!.res)),
    );

    const { result, rerender } = renderHook(
      ({ sucursalId }: { sucursalId: string }) => useResumenVentas({ sucursalId }),
      { initialProps: { sucursalId: "sucursal-1" } },
    );
    await dejarCorrer();
    rerender({ sucursalId: "sucursal-2" });
    await dejarCorrer();

    await act(async () => {
      primera.resolver({
        resumen: {
          porOrigen: { sistema: { total: 0, cantidad: 0 }, alegra: { total: 0, cantidad: 0 } },
        },
      });
      await Promise.resolve();
    });
    await dejarCorrer();

    expect(result.current.tipo).toBe("cargando");
  });
});
