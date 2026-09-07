// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { SelectorTipoPiel } from "./selector-tipo-piel";

/**
 * El tipo de piel se anota mientras se atiende. Si el guardado falla y el
 * desplegable se queda con el valor nuevo, quien lo puso se va creyendo que
 * quedó anotado — y ese dato alimenta las recomendaciones dermatológicas.
 * Peor que no dejar cambiarlo.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pintar = (props: Partial<React.ComponentProps<typeof SelectorTipoPiel>> = {}) =>
  render(
    <SelectorTipoPiel clienteId="c1" valor="not_specified" {...props} />,
  );

describe("SelectorTipoPiel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));
  });

  it("enseña el valor que tiene el cliente", () => {
    pintar({ valor: "oily" });
    expect(screen.getByLabelText("Tipo de piel")).toHaveValue("oily");
  });

  it("🔴 guarda al cambiar, con PATCH al cliente correcto", async () => {
    const onGuardado = vi.fn();
    pintar({ onGuardado });
    fireEvent.change(screen.getByLabelText("Tipo de piel"), { target: { value: "sensitive" } });
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith("sensitive"));

    const llamada = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(llamada[0]).toBe("/api/customers/c1");
    expect(llamada[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String(llamada[1].body))).toEqual({ skinType: "sensitive" });
  });

  it("🔴 si el guardado FALLA, el valor vuelve atrás y se avisa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "No tienes permiso." }), { status: 403 }),
        ),
      ),
    );
    const onError = vi.fn();
    pintar({ valor: "dry", onError });
    const select = screen.getByLabelText("Tipo de piel");
    fireEvent.change(select, { target: { value: "acne_prone" } });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("No tienes permiso."));
    // 🔴 Lo que no puede pasar: quedarse en «acne_prone» sin haberse guardado.
    expect(select).toHaveValue("dry");
  });

  it("🔴 si la red se cae, también vuelve atrás", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red"))));
    const onError = vi.fn();
    pintar({ valor: "normal", onError });
    const select = screen.getByLabelText("Tipo de piel");
    fireEvent.change(select, { target: { value: "mature" } });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(select).toHaveValue("normal");
  });

  it("no llama al servidor si se elige el mismo valor", () => {
    pintar({ valor: "oily" });
    fireEvent.change(screen.getByLabelText("Tipo de piel"), { target: { value: "oily" } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("🔴 un guardado BUENO no se revierte solo", async () => {
    // La primera versión sincronizaba con el valor de arriba en cuanto
    // terminaba la petición, y como la fila NO se recarga, ese valor sigue
    // siendo el viejo: el desplegable saltaba atrás después de guardar bien.
    const onGuardado = vi.fn();
    pintar({ valor: "dry", onGuardado });
    const select = screen.getByLabelText("Tipo de piel");
    fireEvent.change(select, { target: { value: "oily" } });
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith("oily"));
    expect(select).toHaveValue("oily");
  });

  it("un refresco externo SÍ manda: si la fila cambia por fuera, se obedece", () => {
    const { rerender } = pintar({ valor: "dry" });
    rerender(<SelectorTipoPiel clienteId="c1" valor="mature" />);
    expect(screen.getByLabelText("Tipo de piel")).toHaveValue("mature");
  });

  it("ofrece TODOS los tipos de piel, no un puñado", () => {
    pintar();
    // Antes el filtro de la pantalla llevaba tres opciones fijas y sueltas.
    expect(screen.getAllByRole("option")).toHaveLength(10);
  });
});
