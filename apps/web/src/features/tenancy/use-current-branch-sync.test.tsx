// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCurrentBranch, setBranchActive } from "./branch-store";

const KEY = "dermaland.current-branch";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

/**
 * Monta dos instancias del hook (selector superior + POS) y garantiza 2
 * sucursales activas. Se activa Naco DESPUÉS de montar para que el override
 * sobreviva a `ensureStorageVersion` (que solo limpia si la versión no estaba
 * fijada, lo cual ya ocurrió en el primer render).
 */
function mountTwoWithTwoActiveBranches() {
  const top = renderHook(() => useCurrentBranch()); // selector superior
  const pos = renderHook(() => useCurrentBranch()); // dentro del POS
  act(() => {
    setBranchActive("br_sd_naco", true);
  });
  return { top, pos };
}

describe("useCurrentBranch — sincronía POS ↔ selector superior", () => {
  it("cambiar la sucursal en UNA instancia la actualiza en TODAS (misma fuente)", () => {
    const { top, pos } = mountTwoWithTwoActiveBranches();

    const branches = top.result.current.branches;
    expect(branches.length).toBeGreaterThan(1);

    const current = top.result.current.branchId;
    const target = branches.find((b) => b.id !== current)!;
    expect(target).toBeDefined();

    act(() => {
      top.result.current.setBranchId(target.id);
    });

    expect(top.result.current.branchId).toBe(target.id);
    // El POS NO puede quedar con el branchId viejo: debe reflejar el cambio.
    expect(pos.result.current.branchId).toBe(target.id);
  });

  it("persiste la selección en localStorage (una sola fuente de verdad)", () => {
    const { top } = mountTwoWithTwoActiveBranches();
    const target = top.result.current.branches.find(
      (b) => b.id !== top.result.current.branchId,
    )!;
    act(() => {
      top.result.current.setBranchId(target.id);
    });
    expect(window.localStorage.getItem(KEY)).toBe(target.id);
  });

  it("el cambio se propaga sin importar qué instancia lo dispare", () => {
    const { top, pos } = mountTwoWithTwoActiveBranches();
    const target = pos.result.current.branches.find(
      (b) => b.id !== pos.result.current.branchId,
    )!;
    act(() => {
      pos.result.current.setBranchId(target.id); // cambio disparado desde el POS
    });
    expect(top.result.current.branchId).toBe(target.id);
    expect(pos.result.current.branchId).toBe(target.id);
  });
});
