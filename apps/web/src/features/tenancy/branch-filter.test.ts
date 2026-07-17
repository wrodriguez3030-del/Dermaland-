import { describe, it, expect } from "vitest";
import { branchMatches, ALL_BRANCHES } from "./branch-filter";

describe("branchMatches", () => {
  it("'all' (Todas las sucursales) pasa cualquier sucursal", () => {
    expect(branchMatches("b1", ALL_BRANCHES)).toBe(true);
    expect(branchMatches("b2", ALL_BRANCHES)).toBe(true);
    expect(branchMatches("", ALL_BRANCHES)).toBe(true);
  });

  it("una sucursal específica solo pasa la que coincide", () => {
    expect(branchMatches("b1", "b1")).toBe(true);
    expect(branchMatches("b2", "b1")).toBe(false);
  });
});
