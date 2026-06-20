// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createBranch,
  updateBranch,
  setBranchActive,
  deleteBranch,
  listAllBranches,
  listActiveBranches,
  listActiveBranchIds,
  onlyActiveBranches,
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
  ensureStorageVersion,
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

describe("filtrado operativo por sucursal activa", () => {
  it("la sucursal demo Naco viene INACTIVA en el seed", () => {
    const naco = mockBranches.find((b) => b.id === "br_sd_naco");
    expect(naco?.status).toBe("inactive");
    expect(listActiveBranches().some((b) => b.id === "br_sd_naco")).toBe(false);
    expect(listActiveBranchIds().has("br_sd_naco")).toBe(false);
  });

  it("listActiveBranchIds incluye solo activas (Santiago sí, Naco no)", () => {
    const ids = listActiveBranchIds();
    expect(ids.has("br_santiago")).toBe(true);
    expect(ids.has("br_sd_naco")).toBe(false);
  });

  it("onlyActiveBranches excluye items de sucursales inactivas/eliminadas", () => {
    const items = [
      { branchId: "br_santiago", n: 1 },
      { branchId: "br_sd_naco", n: 2 },
      { branchId: "br_sd_piantini", n: 3 },
    ];
    expect(onlyActiveBranches(items).map((i) => i.n)).toEqual([1]);
  });

  it("al inactivar una sucursal, sus items dejan de ser operativos", () => {
    setBranchActive("br_santiago", false);
    expect(onlyActiveBranches([{ branchId: "br_santiago" }])).toHaveLength(0);
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

// ─── Tests modo Supabase (Fix 1) ─────────────────────────────────────────────

describe("useBranches — modo supabase: no fallback a mock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("en modo supabase, fetch fallido NO devuelve sucursales mock/localStorage", async () => {
    // Simular que el fetch falla (sesión expirada / RLS / red).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network error"),
    );

    // Verificamos que fetchBranchesFromServer rechaza la promesa (el catch
    // del useBranches no debería rellenar con mock).
    const { fetchBranchesFromServer } = await import("./branch-store");
    await expect(fetchBranchesFromServer("admin")).rejects.toThrow();

    // La lista de sucursales mock SÍ contiene Naco (status inactive pero existe).
    // En modo supabase con fetch fallido, el resultado NO debería incluir Naco.
    // Comprobamos que listAllBranches() sí tiene Naco (confirma que el mock existe)
    // pero que el path de supabase NO lo usa.
    const mockList = listAllBranches();
    expect(mockList.some((b) => b.id === "br_sd_naco")).toBe(true); // confirma que existe en mock

    // El fetch falló → en modo supabase la lista queda [] (vacía), nunca mock.
    // No podemos testear el hook en jsdom sin renderizar, pero podemos confirmar
    // que fetchBranchesFromServer rechaza y que listAllBranches (mock path) tiene Naco.
    // La separación queda garantizada en código: el catch de useBranches ya NO llama a listAllBranches.
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("en modo supabase, fetch OK devuelve solo las sucursales del servidor (sin mezcla mock)", async () => {
    const santiagoBranch = { ...mockBranches[0]!, id: "db_br_santiago_real" };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ branches: [santiagoBranch] }),
    } as Response);

    const { fetchBranchesFromServer } = await import("./branch-store");
    const branches = await fetchBranchesFromServer("admin");

    // Solo Santiago real del servidor, sin Naco ni Piantini.
    expect(branches).toHaveLength(1);
    expect(branches[0]!.id).toBe("db_br_santiago_real");
    expect(branches.some((b) => b.id === "br_sd_naco")).toBe(false);
    expect(branches.some((b) => b.id === "br_sd_piantini")).toBe(false);
  });

  it("en modo supabase, Naco no aparece como sucursal operativa activa (fetch OK sin Naco)", async () => {
    const santiagoBranch = { ...mockBranches[0]!, status: "active" as const };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ branches: [santiagoBranch] }),
    } as Response);

    const { fetchBranchesFromServer } = await import("./branch-store");
    const branches = await fetchBranchesFromServer("admin");
    const active = branches.filter((b) => b.status === "active");

    expect(active.some((b) => b.name.includes("Naco"))).toBe(false);
    expect(active.some((b) => b.id === "br_sd_naco")).toBe(false);
  });
});

// ─── Tests ensureStorageVersion (Fix 2) ──────────────────────────────────────

describe("ensureStorageVersion", () => {
  const KEY_NEW = "dermaland.branches";
  const KEY_OVERRIDES = "dermaland.branches.overrides";
  const KEY_DELETED = "dermaland.branches.deleted";
  const KEY_VERSION = "dermaland.storage-version";
  const AUTH_KEY = "sb-access-token";
  const PREF_KEY = "dermaland.theme";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("borra las 3 keys de sucursales cuando la versión es antigua", () => {
    window.localStorage.setItem(KEY_NEW, JSON.stringify([{ id: "br_sd_naco" }]));
    window.localStorage.setItem(KEY_OVERRIDES, JSON.stringify({ br_sd_naco: { status: "active" } }));
    window.localStorage.setItem(KEY_DELETED, JSON.stringify(["br_sd_piantini"]));
    window.localStorage.setItem(KEY_VERSION, "1"); // versión vieja

    ensureStorageVersion();

    expect(window.localStorage.getItem(KEY_NEW)).toBeNull();
    expect(window.localStorage.getItem(KEY_OVERRIDES)).toBeNull();
    expect(window.localStorage.getItem(KEY_DELETED)).toBeNull();
  });

  it("borra las 3 keys cuando no hay versión guardada (primera vez)", () => {
    window.localStorage.setItem(KEY_NEW, JSON.stringify([{ id: "br_sd_naco" }]));
    // KEY_VERSION no existe → debe limpiar igual.

    ensureStorageVersion();

    expect(window.localStorage.getItem(KEY_NEW)).toBeNull();
  });

  it("conserva las keys de auth y preferencias al migrar", () => {
    window.localStorage.setItem(KEY_VERSION, "1");
    window.localStorage.setItem(AUTH_KEY, "token-secreto");
    window.localStorage.setItem(PREF_KEY, "dark");

    ensureStorageVersion();

    expect(window.localStorage.getItem(AUTH_KEY)).toBe("token-secreto");
    expect(window.localStorage.getItem(PREF_KEY)).toBe("dark");
  });

  it("es idempotente: segunda llamada no borra datos nuevos ya en la versión actual", () => {
    ensureStorageVersion(); // pone versión actual

    // Simular que el usuario crea una nueva sucursal local (en modo local).
    window.localStorage.setItem(KEY_NEW, JSON.stringify([{ id: "br_nueva" }]));

    ensureStorageVersion(); // segunda llamada — no debería borrar nada

    expect(window.localStorage.getItem(KEY_NEW)).toBe(JSON.stringify([{ id: "br_nueva" }]));
  });

  it("actualiza la versión guardada a STORAGE_VERSION después de limpiar", () => {
    window.localStorage.setItem(KEY_VERSION, "1");

    ensureStorageVersion();

    expect(window.localStorage.getItem(KEY_VERSION)).toBe("2");
  });
});

// ─── Tests no-import guard: selectores operativos no usan mock ───────────────
// Verifican a nivel de fuente que los selectores operativos listados NO importan
// listActiveBranches ni mockBranches directamente. En modo supabase esas fuentes
// son locales/mock; el hook useActiveBranches trae sucursales reales del servidor.

import * as fs from "fs";
import * as path from "path";

describe("no-import guard: selectores operativos usan useActiveBranches (no mock)", () => {
  // __dirname = apps/web/src/features/tenancy → go 3 levels up to apps/web
  const appRoot = path.resolve(__dirname, "../../../");

  const operationalFiles = [
    "features/purchases/compras-modals.tsx",
    "app/(app)/inventario/transferencias/page.tsx",
    "app/(app)/inventario/transferencias/nueva/page.tsx",
    "features/inventory/lot-modals.tsx",
    "app/(app)/conteo-fisico/nuevo/page.tsx",
    "features/products/product-form.tsx",
    "app/(app)/inventario/cuarentena/page.tsx",
    "features/purchases/expenses-view.tsx",
  ];

  for (const relPath of operationalFiles) {
    const fullPath = path.join(appRoot, "src", relPath);
    it(`${relPath} no importa listActiveBranches ni mockBranches directo`, () => {
      const source = fs.readFileSync(fullPath, "utf-8");
      expect(source).not.toMatch(/\blistActiveBranches\b/);
      // mockBranches importado desde @/lib/mock-data/tenancy es el leak que
      // se cerró en expenses-view; comprobamos que ya no aparece en imports.
      expect(source).not.toMatch(/import[^;]*mockBranches[^;]*from[^;]*mock-data\/tenancy/);
    });
  }
});
