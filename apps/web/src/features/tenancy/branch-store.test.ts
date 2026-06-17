// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createBranch,
  updateBranch,
  setBranchActive,
  deleteBranch,
  listAllBranches,
  getBranchFromStore,
  branchDependencies,
  clearLocalBranches,
} from "./branch-store";
import { canManageBranches } from "./permissions";
import { mockBranches } from "@/lib/mock-data/tenancy";
import { clearLocalInventory } from "@/features/inventory/lot-store";

beforeEach(() => {
  window.localStorage.clear();
  clearLocalBranches();
  clearLocalInventory();
});

describe("branch-store CRUD", () => {
  it("lista el seed de sucursales", () => {
    expect(listAllBranches().length).toBeGreaterThanOrEqual(mockBranches.length);
  });

  it("crea una sucursal", () => {
    const r = createBranch({ name: "DermaLand Bávaro", code: "BAV-01" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(getBranchFromStore(r.branch.id)?.name).toBe("DermaLand Bávaro");
  });

  it("rechaza código duplicado dentro del business", () => {
    const code = mockBranches[0]!.code;
    const r = createBranch({ name: "Otra", code });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingFields).toContain("code");
  });

  it("rechaza alta sin nombre/código", () => {
    const r = createBranch({ name: "", code: "" });
    expect(r.ok).toBe(false);
  });

  it("edita una sucursal del seed (override)", () => {
    const seed = mockBranches[0]!;
    const r = updateBranch(seed.id, { phone: "+1 809-000-0000", city: "Moca" });
    expect(r.ok).toBe(true);
    expect(getBranchFromStore(seed.id)?.phone).toBe("+1 809-000-0000");
    expect(getBranchFromStore(seed.id)?.city).toBe("Moca");
  });

  it("inactiva y reactiva", () => {
    const seed = mockBranches[0]!;
    setBranchActive(seed.id, false);
    expect(getBranchFromStore(seed.id)?.status).toBe("inactive");
    setBranchActive(seed.id, true);
    expect(getBranchFromStore(seed.id)?.status).toBe("active");
  });
});

describe("eliminación con dependencias", () => {
  it("bloquea eliminar una sucursal con datos asociados (almacenes/lotes)", () => {
    // br_santiago tiene almacenes y lotes seed.
    const deps = branchDependencies("br_santiago");
    expect(deps.total).toBeGreaterThan(0);
    const r = deleteBranch("br_santiago");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no se puede eliminar/i);
    // Sigue existiendo (no se borró).
    expect(getBranchFromStore("br_santiago")).toBeDefined();
  });

  it("permite eliminar una sucursal nueva sin dependencias", () => {
    const r = createBranch({ name: "Temporal", code: "TMP-99" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(branchDependencies(r.branch.id).total).toBe(0);
    const del = deleteBranch(r.branch.id);
    expect(del.ok).toBe(true);
    expect(getBranchFromStore(r.branch.id)).toBeUndefined();
  });
});

describe("permisos (RBAC)", () => {
  it("admin/manager pueden gestionar; cashier no", () => {
    expect(canManageBranches("admin")).toBe(true);
    expect(canManageBranches("manager")).toBe(true);
    expect(canManageBranches("cashier")).toBe(false);
    expect(canManageBranches("auditor")).toBe(false);
  });
});

describe("scoping single-business", () => {
  it("toda sucursal creada lleva el business_id del negocio (sin cross-business)", () => {
    const r = createBranch({ name: "Scoped", code: "SCP-01" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.branch.businessId).toBe(mockBranches[0]!.businessId);
    }
    expect(listAllBranches().every((b) => b.businessId === mockBranches[0]!.businessId)).toBe(true);
  });
});
