// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

/**
 * El panel abría en "Todos los meses / Todos los años": "Ventas del período"
 * enseñaba los RD$48 millones migrados de Alegra —todo el histórico— cuando lo
 * que el dueño abre el panel a mirar es cómo va ESTE mes.
 *
 * Estas pruebas fijan las tres cosas que no pueden volver a romperse: que
 * arranque en el mes en curso, que el año elegido exista como opción aunque no
 * haya ni una proforma propia, y que el histórico entero no se pida en el frame
 * previo solo para descartarlo.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
}));

import DashboardPage from "./page";

/** Todas las peticiones del panel, para poder mirar CUÁNDO y con qué se piden. */
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 14, 10, 0, 0)); // 14 de septiembre de 2026
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ total: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

const urlsPedidas = () => fetchMock.mock.calls.map((c) => String(c[0] as string | URL));

describe("Dashboard — período por defecto", () => {
  it("🔴 arranca en el mes en curso, no en «Todos»", async () => {
    render(<DashboardPage />);
    const mes = screen.getByLabelText("Mes") as HTMLSelectElement;
    const anio = screen.getByLabelText("Año") as HTMLSelectElement;
    await waitFor(() => expect(mes.value).toBe("9"));
    expect(anio.value).toBe("2026");
  });

  it("🔴 el año en curso tiene su opción aunque no haya ni una proforma propia", async () => {
    // La lista de años sale de las proformas y hoy están en cero: todo el
    // histórico vive en Alegra. Sin añadir el año elegido, el selector
    // enseñaría 2026 sin ninguna opción detrás.
    render(<DashboardPage />);
    const anio = screen.getByLabelText("Año") as HTMLSelectElement;
    await waitFor(() => expect(anio.value).toBe("2026"));
    const valores = Array.from(anio.options).map((o) => o.value);
    expect(valores).toContain("2026");
  });

  it("🔴 «Clientes nuevos» se pide ya acotado al mes en curso, nunca sin período", async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(urlsPedidas().some((u) => u.includes("/api/customers/nuevos"))).toBe(true);
    });
    const clientes = urlsPedidas().filter((u) => u.includes("/api/customers/nuevos"));
    // Ni una petición sin período: contar los clientes de TODA la vida para
    // tirar el número un frame después es exactamente lo que se está evitando.
    for (const u of clientes) {
      expect(u).toContain("mes=9");
      expect(u).toContain("anio=2026");
    }
  });

  it("🔴 pasar a «Todos los años» no borra el año en curso de las opciones", async () => {
    // La lista de años se arma con las proformas propias, que hoy están en
    // cero. Si 2026 solo estuviera por ser el año ELEGIDO, al pasar a "Todos"
    // desaparecía y no había forma de volver a él sin recargar la página.
    render(<DashboardPage />);
    const anio = screen.getByLabelText("Año") as HTMLSelectElement;
    await waitFor(() => expect(anio.value).toBe("2026"));

    fireEvent.change(anio, { target: { value: "all" } });
    expect(anio.value).toBe("all");
    expect(Array.from(anio.options).map((o) => o.value)).toContain("2026");

    // Y se puede volver.
    fireEvent.change(anio, { target: { value: "2026" } });
    expect(anio.value).toBe("2026");
  });

  it("🔴 el usuario puede volver a «Todos» y el efecto de montaje no se lo pisa", async () => {
    render(<DashboardPage />);
    const mes = screen.getByLabelText("Mes") as HTMLSelectElement;
    await waitFor(() => expect(mes.value).toBe("9"));

    fireEvent.change(mes, { target: { value: "all" } });
    expect(mes.value).toBe("all");
    // Un rato después sigue en "all": el efecto corre una sola vez.
    await Promise.resolve();
    expect(mes.value).toBe("all");
  });
});
