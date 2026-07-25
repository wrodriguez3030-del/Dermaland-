// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rateLimit, _resetRateLimitStore } from "./rate-limit";

describe("rateLimit — DL-17", () => {
  beforeEach(() => _resetRateLimitStore());

  it("permite hasta el límite y luego bloquea con retry-after", () => {
    const key = "k1";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("se reinicia al pasar la ventana", () => {
    const key = "k2";
    const spy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
    expect(rateLimit(key, 1, 1000).ok).toBe(false); // dentro de la ventana
    spy.mockReturnValue(1_002_000); // +2s → nueva ventana
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
    spy.mockRestore();
  });

  it("aísla claves distintas", () => {
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true); // otra clave, no afectada
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
  });
});
