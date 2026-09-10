// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

afterEach(() => vi.useRealTimers());

describe("useDebounce", () => {
  it("devuelve el valor inicial de inmediato", () => {
    const { result } = renderHook(() => useDebounce("a", 200));
    expect(result.current).toBe("a");
  });

  it("no actualiza el valor hasta que pasa el delay sin cambios nuevos", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 200), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a"); // todavía no pasó el delay completo

    rerender({ v: "abc" }); // escribió otra letra antes de que venciera → reinicia el conteo
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("a"); // el reinicio evitó que "ab" se publicara

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("abc"); // solo el último valor, tras la pausa
  });
});
