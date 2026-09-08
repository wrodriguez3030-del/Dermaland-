// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * El ojo entrega una credencial en pantalla. Lo que se prueba es lo que impide
 * que esa credencial se quede por ahí:
 *
 *  - No se pide sola al pintar: si no, abrir el panel destaparía las claves de
 *    todo el personal y dejaría un registro de auditoría por cabeza.
 *  - Se borra sola a los 30 segundos.
 *  - Un 403 por falta de segundo factor manda al desafío, no dice «no tienes
 *    permiso» — que sería falso.
 */

const verClave = vi.fn();
vi.mock("../user-store", () => ({ verClave: (...a: unknown[]) => verClave(...a) }));

const { ClaveReveal } = await import("./clave-reveal");

beforeEach(() => {
  vi.clearAllMocks();
  verClave.mockResolvedValue({
    ok: true,
    clave: "Kx7m-Rt4p-Wq9s",
    asignadaEl: "2026-09-07T10:00:00Z",
    asignadaPor: "admin-1",
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pintar = () => render(<ClaveReveal userId="u1" nombre="Heidi Pinales" />);

describe("el ojo de la clave", () => {
  it("🔴 NO pide la clave al pintar: hace falta pulsar", () => {
    pintar();
    expect(verClave).not.toHaveBeenCalled();
    expect(screen.queryByText("Kx7m-Rt4p-Wq9s")).not.toBeInTheDocument();
  });

  it("avisa de que la consulta queda registrada ANTES de pedirla", () => {
    pintar();
    expect(screen.getByText(/queda registrado en auditoría/i)).toBeInTheDocument();
  });

  it("🔴 al pulsar, pide la clave del usuario correcto y la enseña", async () => {
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await waitFor(() => expect(screen.getByText("Kx7m-Rt4p-Wq9s")).toBeInTheDocument());
    expect(verClave).toHaveBeenCalledWith("u1");
  });

  it("🔴 se oculta sola a los 30 segundos", async () => {
    // Sin `shouldAdvanceTime`: con esa opción los timers avanzan también con el
    // reloj real y el `waitFor` de abajo se come la cuenta atrás antes de que
    // la prueba la controle.
    vi.useFakeTimers();
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Kx7m-Rt4p-Wq9s")).toBeInTheDocument();
    // Tic a tic: cada temporizador se programa DENTRO del efecto que corre
    // tras repintar, así que hay que dejar a React repintar entre uno y otro.
    // Un solo salto de 31 s deja la cadena a medias.
    for (let i = 0; i < 31; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.queryByText("Kx7m-Rt4p-Wq9s")).not.toBeInTheDocument();
    expect(screen.getByText("Ver la clave")).toBeInTheDocument();
  });

  it("se puede ocultar a mano antes de tiempo", async () => {
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await waitFor(() => expect(screen.getByText("Kx7m-Rt4p-Wq9s")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Ocultar la clave"));
    expect(screen.queryByText("Kx7m-Rt4p-Wq9s")).not.toBeInTheDocument();
  });

  it("🔴 un error del servidor se enseña y NO se inventa una clave", async () => {
    verClave.mockResolvedValue({
      ok: false,
      error: "Este usuario no tiene clave asignada desde el panel. Asígnale una.",
    });
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await waitFor(() =>
      expect(screen.getByText(/no tiene clave asignada/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("code")).not.toBeInTheDocument();
  });

  it("🔴 pasado el límite de consultas lo dice", async () => {
    verClave.mockResolvedValue({
      ok: false,
      error: "Demasiadas consultas de claves seguidas. Espera unos minutos.",
    });
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await waitFor(() => expect(screen.getByText(/Demasiadas consultas/i)).toBeInTheDocument());
  });

  it("la cuenta atrás se ve, para que nadie se confíe", async () => {
    pintar();
    fireEvent.click(screen.getByText("Ver la clave"));
    await waitFor(() => expect(screen.getByText(/Se oculta sola en 30 s/)).toBeInTheDocument());
  });
});
