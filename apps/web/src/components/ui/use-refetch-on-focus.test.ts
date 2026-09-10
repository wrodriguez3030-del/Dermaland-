// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRefetchOnFocus } from "./use-refetch-on-focus";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useRefetchOnFocus", () => {
  it("no llama al callback al montar", () => {
    const cb = vi.fn();
    renderHook(() => useRefetchOnFocus(cb));
    expect(cb).not.toHaveBeenCalled();
  });

  it("🔴 al volver a la pestaña (visibilitychange → visible) refresca — el caso real: una venta de crédito hecha en el POS no aparecía en Cuentas por cobrar hasta recargar, porque la pestaña ya abierta nunca volvía a pedir datos", () => {
    const cb = vi.fn();
    renderHook(() => useRefetchOnFocus(cb));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("no refresca cuando la pestaña se OCULTA, solo cuando vuelve a mostrarse", () => {
    const cb = vi.fn();
    renderHook(() => useRefetchOnFocus(cb));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("también refresca con el evento `focus` de la ventana (bfcache / cambio de app)", () => {
    const cb = vi.fn();
    renderHook(() => useRefetchOnFocus(cb));
    window.dispatchEvent(new Event("focus"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("al desmontar, deja de escuchar", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useRefetchOnFocus(cb));
    unmount();
    window.dispatchEvent(new Event("focus"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("usa siempre el callback MÁS RECIENTE, sin volver a suscribirse", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = renderHook(({ cb }) => useRefetchOnFocus(cb), {
      initialProps: { cb: cb1 },
    });
    rerender({ cb: cb2 });
    window.dispatchEvent(new Event("focus"));
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
