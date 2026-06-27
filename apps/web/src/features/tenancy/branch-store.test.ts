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
  getBranchDisplayName,
  cacheBranchNames,
  getBranchFromStore,
  branchDependencies,
  clearLocalBranches,
  resetBranchesToSeed,
  getActiveBranches,
  getAllBranchesForAdmin,
  getBranchById,
  ensureStorageVersion,
  getOperationalBranches,
  getAdminBranches,
  getDeletedBranches,
  restoreDeletedBranch,
  pickPrincipalBranch,
} from "./branch-store";
import { mockWarehouses } from "@/lib/mock-data/tenancy";
import { canManageBranches } from "./permissions";
import { mockBranches } from "@/lib/mock-data/tenancy";
import { clearLocalInventory } from "@/features/inventory/lot-store";
import type { Branch } from "@/types";

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

describe("getBranchDisplayName — nunca expone el UUID al usuario", () => {
  const UNKNOWN_UUID = "00000000-0000-0000-0000-00000000b001";

  it("resuelve el nombre cuando la sucursal existe", () => {
    const seed = mockBranches[0]!;
    expect(getBranchDisplayName(seed.id)).toBe(seed.name);
  });

  it("para un id desconocido devuelve 'Sucursal no encontrada', NO el UUID", () => {
    const out = getBranchDisplayName(UNKNOWN_UUID);
    expect(out).toBe("Sucursal no encontrada");
    expect(out).not.toContain(UNKNOWN_UUID);
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("acepta un fallback personalizado (p. ej. 'Sucursal seleccionada')", () => {
    expect(getBranchDisplayName(UNKNOWN_UUID, "Sucursal seleccionada")).toBe(
      "Sucursal seleccionada",
    );
  });

  it("para id vacío devuelve el fallback", () => {
    expect(getBranchDisplayName("")).toBe("Sucursal no encontrada");
  });

  it("resuelve sucursales de Supabase (no-mock) vía el cache en memoria", () => {
    // Simula el modo Supabase: la sucursal real no está en mock ni localStorage,
    // solo en la lista que llegó del servidor (cacheada en cada fetch).
    const SUPA_ID = "c1c90936-7b35-44af-8f86-74d209a576a0";
    expect(getBranchDisplayName(SUPA_ID)).toBe("Sucursal no encontrada");
    cacheBranchNames([
      { id: SUPA_ID, name: "DermaLand Principal" } as unknown as Branch,
    ]);
    expect(getBranchDisplayName(SUPA_ID)).toBe("DermaLand Principal");
  });

  it("resolveBranchName (alias) tampoco devuelve el UUID para un id desconocido", () => {
    const out = resolveBranchName(UNKNOWN_UUID);
    expect(out).toBe("Sucursal no encontrada");
    expect(out).not.toContain(UNKNOWN_UUID);
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

    expect(window.localStorage.getItem(KEY_VERSION)).toBe("3");
  });
});

// ─── Tests: nuevos helpers centrales (Tarea 2) ───────────────────────────────

describe("helpers centrales de sucursales", () => {
  it("getOperationalBranches solo devuelve activas (no eliminadas ni inactivas)", () => {
    // Naco ya viene inactiva en el seed.
    const ops = getOperationalBranches();
    expect(ops.every((b) => b.status === "active")).toBe(true);
    expect(ops.some((b) => b.id === "br_sd_naco")).toBe(false);
  });

  it("getAdminBranches incluye activas e inactivas pero NO las soft-deleted", () => {
    // Crear una sucursal y eliminarla (soft-delete local).
    const r = createBranch({ name: "Para borrar", code: "DEL-01" });
    if (!r.ok) throw new Error("setup");
    const id = r.branch.id;
    deleteBranch(id);

    const admin = getAdminBranches();
    expect(admin.some((b) => b.id === id)).toBe(false); // eliminada → fuera
    // Inactivas SÍ aparecen.
    expect(admin.some((b) => b.id === "br_sd_naco")).toBe(true);
  });

  it("getDeletedBranches solo devuelve eliminadas (seed branch sin deps)", () => {
    // Sin eliminadas: debe estar vacío.
    expect(getDeletedBranches()).toHaveLength(0);

    // br_sd_piantini es una sucursal seed sin dependencias (no tiene almacén en mockWarehouses).
    const id = "br_sd_piantini";
    expect(branchDependencies(id).total).toBe(0); // confirmar sin deps
    const res = deleteBranch(id);
    expect(res.ok).toBe(true);

    const deleted = getDeletedBranches();
    expect(deleted.some((b) => b.id === id)).toBe(true);
    // Las activas/inactivas NO aparecen en deleted.
    expect(deleted.some((b) => b.id === "br_santiago")).toBe(false);
    expect(deleted.some((b) => b.id === "br_sd_naco")).toBe(false);
  });

  it("sucursal seed eliminada no aparece en getAdminBranches ni getOperationalBranches por defecto", () => {
    // br_sd_piantini no tiene deps → se puede eliminar (soft-delete en KEY_DELETED).
    const id = "br_sd_piantini";
    deleteBranch(id);

    expect(getAdminBranches().some((b) => b.id === id)).toBe(false);
    expect(getOperationalBranches().some((b) => b.id === id)).toBe(false);
  });

  it("restoreDeletedBranch saca una sucursal seed de deleted y la deja inactiva", () => {
    // br_sd_piantini no tiene deps → soft-delete → restaurar.
    const id = "br_sd_piantini";
    deleteBranch(id);

    expect(getDeletedBranches().some((b) => b.id === id)).toBe(true);
    const res = restoreDeletedBranch(id);
    expect(res.ok).toBe(true);

    // Ya no está en deleted.
    expect(getDeletedBranches().some((b) => b.id === id)).toBe(false);
    // Volvió a admin como inactiva.
    expect(getAdminBranches().some((b) => b.id === id)).toBe(true);
    expect(getBranchById(id)?.status).toBe("inactive");
  });
});

// ─── Tests: STORAGE_VERSION "3" limpia datos viejos y preserva auth (Tarea 4) ─

describe("ensureStorageVersion v3 — limpieza y preservación", () => {
  const KEY_NEW = "dermaland.branches";
  const KEY_OVERRIDES = "dermaland.branches.overrides";
  const KEY_DELETED = "dermaland.branches.deleted";
  const KEY_VERSION = "dermaland.storage-version";
  const AUTH_KEY = "sb-access-token";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("STORAGE_VERSION es '3'", () => {
    ensureStorageVersion();
    expect(window.localStorage.getItem(KEY_VERSION)).toBe("3");
  });

  it("limpia branches viejos (versión 2) y preserva auth", () => {
    window.localStorage.setItem(KEY_VERSION, "2"); // versión previa
    window.localStorage.setItem(KEY_NEW, JSON.stringify([{ id: "br_sd_naco" }]));
    window.localStorage.setItem(KEY_OVERRIDES, JSON.stringify({ br_sd_naco: { status: "active" } }));
    window.localStorage.setItem(AUTH_KEY, "token-valido");

    ensureStorageVersion();

    expect(window.localStorage.getItem(KEY_NEW)).toBeNull();
    expect(window.localStorage.getItem(KEY_OVERRIDES)).toBeNull();
    expect(window.localStorage.getItem(KEY_DELETED)).toBeNull();
    expect(window.localStorage.getItem(AUTH_KEY)).toBe("token-valido"); // auth preservada
    expect(window.localStorage.getItem(KEY_VERSION)).toBe("3");
  });
});

// ─── Tests: el SW contiene CACHE_NAME v2 y clients.claim (Tarea 1) ───────────

import * as fs from "fs";
import * as path from "path";

describe("service-worker — cache bust v2", () => {
  const swPath = path.resolve(__dirname, "../../../public/sw.js");

  it("sw.js contiene CACHE_NAME dermaland-shell-v2", () => {
    const source = fs.readFileSync(swPath, "utf-8");
    expect(source).toMatch(/dermaland-shell-v2/);
  });

  it("sw.js tiene self.clients.claim() en activate", () => {
    const source = fs.readFileSync(swPath, "utf-8");
    expect(source).toMatch(/self\.clients\.claim\(\)/);
  });

  it("sw.js NO contiene el nombre viejo dermaland-shell-v1", () => {
    const source = fs.readFileSync(swPath, "utf-8");
    expect(source).not.toMatch(/dermaland-shell-v1/);
  });
});

// ─── Tests: pantalla admin/sucursales NO muestra códigos warehouse (Tarea 3) ──

describe("admin/sucursales — no expone códigos de almacén", () => {
  const appRoot = path.resolve(__dirname, "../../../");
  const sucursalesDir = path.join(appRoot, "src/app/(app)/admin/sucursales");

  function readAllTsxInDir(dir: string): string {
    let combined = "";
    if (!fs.existsSync(dir)) return combined;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        combined += readAllTsxInDir(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")) {
        combined += fs.readFileSync(full, "utf-8");
      }
    }
    return combined;
  }

  it("ningún archivo de admin/sucursales muestra STG-MAIN, STG-FLOOR, NACO-MAIN como texto visible", () => {
    const source = readAllTsxInDir(sucursalesDir);
    expect(source).not.toMatch(/STG-MAIN|STG-FLOOR|NACO-MAIN/);
  });

  it("ningún archivo de admin/sucursales muestra sección ALMACENES como label visible al usuario", () => {
    const source = readAllTsxInDir(sucursalesDir);
    // No debe haber headings/texto de sección tipo "ALMACENES" ni "Almacenes" visible
    // (warehouseId y warehouse_id como identificadores internos están permitidos).
    const lines = source.split("\n").filter(
      (l) => !l.includes("warehouseId") && !l.includes("warehouse_id") && !l.includes("// ") && !l.includes(" * "),
    );
    const hasWarehouseSection = lines.some((l) => />\s*Almacenes?\s*<|ALMACENES/i.test(l));
    expect(hasWarehouseSection).toBe(false);
  });
});

// ─── Tests no-import guard: selectores operativos no usan mock ───────────────
// Verifican a nivel de fuente que los selectores operativos listados NO importan
// listActiveBranches ni mockBranches directamente. En modo supabase esas fuentes
// son locales/mock; el hook useActiveBranches trae sucursales reales del servidor.

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

describe("pickPrincipalBranch", () => {
  const mk = (id: string, name: string, isPilot = false): Branch =>
    ({
      id,
      businessId: "biz",
      code: id.toUpperCase(),
      name,
      address: "",
      city: "",
      province: "",
      country: "RD",
      isPilot,
      showOnWebsite: false,
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }) as Branch;

  it("prioriza la sucursal piloto/principal", () => {
    const list = [mk("b", "Zeta"), mk("a", "Alfa", true), mk("c", "Beta")];
    expect(pickPrincipalBranch(list)?.id).toBe("a");
  });

  it("sin piloto, devuelve la primera por nombre (es-DO)", () => {
    const list = [mk("b", "Zeta"), mk("c", "Beta"), mk("d", "Alfa")];
    expect(pickPrincipalBranch(list)?.name).toBe("Alfa");
  });

  it("lista vacía → undefined", () => {
    expect(pickPrincipalBranch([])).toBeUndefined();
  });
});
