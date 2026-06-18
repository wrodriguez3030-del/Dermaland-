// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createBranch,
  updateBranch,
  setBranchActive,
  deleteBranch,
  listAllBranches,
  listActiveBranches,
  listActiveWarehouses,
  isBranchActive,
  resolveBranchName,
  getBranchFromStore,
  branchDependencies,
  clearLocalBranches,
  resetBranchesToSeed,
  getActiveBranches,
  getAllBranchesForAdmin,
  getBranchById,
} from "./branch-store";
import { mockWarehouses } from "@/lib/mock-data/tenancy";
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

describe("visibilidad operativa (activas vs inactivas/eliminadas)", () => {
  it("una sucursal inactiva NO aparece en operación pero SÍ en Administración", () => {
    const seed = mockBranches[0]!;
    setBranchActive(seed.id, false);
    // Operación: excluida.
    expect(listActiveBranches().some((b) => b.id === seed.id)).toBe(false);
    expect(isBranchActive(seed.id)).toBe(false);
    // Admin: sigue visible con su estado.
    const adminRow = listAllBranches().find((b) => b.id === seed.id);
    expect(adminRow).toBeDefined();
    expect(adminRow!.status).toBe("inactive");
  });

  it("los almacenes de una sucursal inactiva no aparecen como opción operativa", () => {
    const withWh = mockWarehouses[0]!.branchId;
    setBranchActive(withWh, false);
    expect(listActiveWarehouses().some((w) => w.branchId === withWh)).toBe(false);
  });

  it("una sucursal eliminada (nueva, sin deps) no aparece en selectores", () => {
    const r = createBranch({ name: "Efímera", code: "EFI-1" });
    if (!r.ok) throw new Error("setup");
    deleteBranch(r.branch.id);
    expect(listActiveBranches().some((b) => b.id === r.branch.id)).toBe(false);
    expect(listAllBranches().some((b) => b.id === r.branch.id)).toBe(false);
  });

  it("resolveBranchName devuelve el nombre histórico aunque la sucursal esté inactiva", () => {
    const seed = mockBranches[0]!;
    setBranchActive(seed.id, false);
    expect(resolveBranchName(seed.id)).toBe(seed.name);
  });
});

describe("fuente única y reset (sincronización entre equipos)", () => {
  it("aliases: getActiveBranches solo activas, getAllBranchesForAdmin incluye inactivas", () => {
    const seed = mockBranches[0]!;
    setBranchActive(seed.id, false);
    expect(getActiveBranches().some((b) => b.id === seed.id)).toBe(false);
    expect(getAllBranchesForAdmin().some((b) => b.id === seed.id)).toBe(true);
    expect(getBranchById(seed.id)?.id).toBe(seed.id);
  });

  it("resetBranchesToSeed descarta cambios locales y la sucursal seleccionada", () => {
    window.localStorage.setItem("dermaland.current-branch", "br_inexistente");
    createBranch({ name: "Local PC", code: "LOCAL-1" });
    setBranchActive(mockBranches[0]!.id, false);
    expect(getAllBranchesForAdmin().length).toBeGreaterThan(mockBranches.length);

    resetBranchesToSeed();

    expect(getAllBranchesForAdmin().length).toBe(mockBranches.length);
    // Seed restaurado: la sucursal vuelve a su estado original.
    expect(getBranchById(mockBranches[0]!.id)?.status).toBe(mockBranches[0]!.status);
    expect(window.localStorage.getItem("dermaland.current-branch")).toBeNull();
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
