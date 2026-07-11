import { describe, it, expect } from "vitest";
import { isProviderImplemented, IMPLEMENTED_PROVIDERS, createAdapter } from "./factory";
import { estimateCost, OPENAI_PRICING } from "./pricing";

describe("factory de proveedores", () => {
  it("solo OpenAI y compatible están implementados", () => {
    expect(isProviderImplemented("openai")).toBe(true);
    expect(isProviderImplemented("openai_compatible")).toBe(true);
    expect(isProviderImplemented("anthropic")).toBe(false);
    expect(isProviderImplemented("google")).toBe(false);
    expect(isProviderImplemented("local")).toBe(false);
    expect(IMPLEMENTED_PROVIDERS).toEqual(["openai", "openai_compatible"]);
  });

  it("createAdapter lanza para un proveedor sin adaptador", () => {
    expect(() => createAdapter("k", { type: "anthropic" })).toThrow(/todavía no tiene un adaptador/);
  });
});

describe("pricing", () => {
  it("estima costo con precios conocidos", () => {
    const c = estimateCost({ inputTokens: 1000, outputTokens: 1000 }, "gpt-4o-mini");
    expect(c).toBeCloseTo(OPENAI_PRICING["gpt-4o-mini"]!.in + OPENAI_PRICING["gpt-4o-mini"]!.out, 6);
  });
  it("null para modelo desconocido", () => {
    expect(estimateCost({ inputTokens: 100, outputTokens: 100 }, "xyz")).toBeNull();
  });
});
