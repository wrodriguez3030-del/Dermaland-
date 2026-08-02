# Importador de inventario Alegra — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un admin/manager suba desde la app el export de inventario de Alegra y el sistema actualice el stock de **DermaLand Principal** (columna E) y de **Dermaland Cutis** (columna H − columna E), previa vista previa y confirmación.

**Architecture:** Motor puro y testeable (`features/inventory/alegra-import.ts`) que recibe filas + productos + lotes y devuelve un plan de ajuste; dos route handlers (`preview` y `apply`) que arman ese plan **server-side** con datos leídos de la base (nunca del cliente) y lo ejecutan vía los repositorios existentes (`productLot.adjustQuantity`, `productLot.create`, `inventoryMovement.create`); y una página cliente que parsea el `.xlsx` con ExcelJS y muestra el plan antes de aplicarlo.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript estricto · Tailwind 4 · Zod · ExcelJS · Vitest · Supabase (repositorios existentes).

## Global Constraints

- **Aislamiento multi-tenant:** `business_id` y `branch_id` SIEMPRE del `RepoContext` (derivado del JWT), NUNCA del body ni del archivo. Regla dura de `CLAUDE.md` §4.
- **Autorización antes del body:** `authorizeRole(...)` corre ANTES de leer/validar el body (patrón v0.98.0).
- **Validación server-side:** todo body se valida con Zod vía `parseJsonBody(req, schema)` (`@/server/http/parse-body`).
- **Gate de backend:** si `env.DATA_SOURCE !== "supabase"` devolver 409 con el mensaje del patrón `notSupabase()`.
- **Etiquetas legibles:** nunca mostrar UUID, claves crudas ni JSON en la UI. Nombres de sucursal vía `getBranchDisplayName`.
- **`product_lots.expires_at` es NOT NULL.** Un lote nuevo en Cutis hereda el `expires_at` del lote que ese producto tiene en Principal. Si no hay lote en Principal → se reporta y se omite; NUNCA se inventa una fecha.
- **Paginación obligatoria:** toda lectura de listas largas usa el patrón de paginación (`fetchAllPages`/`.range()`); PostgREST corta en 1000 filas en silencio.
- **Roles permitidos:** `["super_admin", "admin", "manager"]`.
- **Sin escrituras en la vista previa.** El endpoint `preview` es solo lectura.
- **`products` NO se toca:** ni precio, ni costo, ni código de barras, ni nombre. Solo `product_lots` + `inventory_movements`.
- **Idempotencia:** re-aplicar el mismo archivo sin cambios intermedios debe producir 0 ajustes.
- Comandos: `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm --filter web build`.

---

### Task 1: Motor puro — parseo de filas y cálculo de objetivos por sucursal

**Files:**
- Create: `apps/web/src/features/inventory/alegra-import.ts`
- Test: `apps/web/src/features/inventory/alegra-import.test.ts`

**Interfaces:**
- Consumes: nada (módulo raíz de la feature).
- Produces:
  - `export interface AlegraRow { rowNumber: number; name: string; qtyPrincipal: number; qtyTotal: number }`
  - `export interface AlegraTargets { rowNumber: number; name: string; principal: number; cutis: number }`
  - `export function normalizeProductName(raw: string): string`
  - `export function rowTargets(row: AlegraRow): AlegraTargets | { rowNumber: number; name: string; error: string }`
  - `export const ALEGRA_HEADERS: { name: string[]; qtyPrincipal: string[]; qtyTotal: string[] }`
  - `export function resolveColumns(header: string[]): { name: number; qtyPrincipal: number; qtyTotal: number }` (índices 0-based; lanza `Error` con las cabeceras encontradas si falta alguna)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-import.test.ts
import { describe, it, expect } from "vitest";
import { normalizeProductName, resolveColumns, rowTargets, ALEGRA_HEADERS } from "./alegra-import";

describe("normalizeProductName", () => {
  it("ignora acentos, mayúsculas y espacios repetidos", () => {
    expect(normalizeProductName("  Avène   Cleanance  ")).toBe(normalizeProductName("AVENE CLEANANCE"));
  });
  it("pega la unidad al número y el SPF", () => {
    expect(normalizeProductName("Crema 30 ML SPF 50")).toBe("CREMA 30ML SPF50");
  });
});

describe("resolveColumns", () => {
  it("ubica las columnas por cabecera sin importar la posición", () => {
    const header = [
      "Categoría", "Producto/servicio", "Referencia", "Descripción",
      "Cantidad en Principal", "Cantidad mínima en Principal",
      "Cantidad máxima en Principal", "Cantidad total",
    ];
    expect(resolveColumns(header)).toEqual({ name: 1, qtyPrincipal: 4, qtyTotal: 7 });
  });
  it("acepta 'Nombre' como alias del producto", () => {
    expect(resolveColumns(["Nombre", "Cantidad en Principal", "Cantidad total"]))
      .toEqual({ name: 0, qtyPrincipal: 1, qtyTotal: 2 });
  });
  it("si falta una cabecera lanza listando las que sí vinieron", () => {
    expect(() => resolveColumns(["Producto/servicio", "Cantidad total"]))
      .toThrow(/Cantidad en Principal/);
  });
});

describe("rowTargets", () => {
  it("Principal sale de la columna E y Cutis de la resta", () => {
    expect(rowTargets({ rowNumber: 2, name: "X", qtyPrincipal: 3, qtyTotal: 8 }))
      .toEqual({ rowNumber: 2, name: "X", principal: 3, cutis: 5 });
  });
  it("si total = principal, Cutis queda en 0", () => {
    expect(rowTargets({ rowNumber: 2, name: "X", qtyPrincipal: 4, qtyTotal: 4 }))
      .toMatchObject({ principal: 4, cutis: 0 });
  });
  it("rechaza total < principal en vez de producir un Cutis negativo", () => {
    expect(rowTargets({ rowNumber: 9, name: "X", qtyPrincipal: 5, qtyTotal: 2 }))
      .toMatchObject({ error: expect.stringContaining("menor") });
  });
  it("rechaza cantidades negativas", () => {
    expect(rowTargets({ rowNumber: 9, name: "X", qtyPrincipal: -1, qtyTotal: 3 }))
      .toMatchObject({ error: expect.stringContaining("negativa") });
  });
  it("ALEGRA_HEADERS expone los alias usados", () => {
    expect(ALEGRA_HEADERS.qtyPrincipal).toContain("Cantidad en Principal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-import`
Expected: FAIL — "Failed to resolve import ./alegra-import".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/inventory/alegra-import.ts
/**
 * Motor PURO del importador de inventario de Alegra (sin React, sin I/O).
 *
 * Reglas de negocio (única fuente de verdad):
 *   stock_principal = columna "Cantidad en Principal"
 *   stock_cutis     = columna "Cantidad total" − "Cantidad en Principal"
 *
 * Alegra desglosa solo el almacén "Principal"; el resto del total vive en el
 * otro almacén, que en DermaLand es Dermaland Cutis (confirmado por el dueño
 * 2026-08-01). La resta se valida: nunca puede dar negativo.
 */

/** Unidades que se pegan al número al normalizar ("30 ML" → "30ML"). */
const UNITS =
  "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";

/**
 * Normaliza un nombre de producto para comparar entre Alegra y DermaLand:
 * mayúsculas, sin acentos, sin signos, unidad pegada al número, SPF pegado.
 * Misma normalización que `scripts/import-stock-principal-from-alegra.mjs`.
 */
export function normalizeProductName(raw: string): string {
  let s = String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s
    .replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2")
    .replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
}

/** Alias de cabecera aceptados para cada campo del export de Alegra. */
export const ALEGRA_HEADERS = {
  name: ["Producto/servicio", "Nombre"],
  qtyPrincipal: ["Cantidad en Principal"],
  qtyTotal: ["Cantidad total"],
} as const;

function headerKey(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ubica las columnas por el TEXTO de la cabecera, no por posición: así acepta
 * tanto el export completo (nombre en B, cantidad en E) como los recortados.
 * Devuelve índices 0-based.
 */
export function resolveColumns(header: string[]): {
  name: number;
  qtyPrincipal: number;
  qtyTotal: number;
} {
  const keys = header.map(headerKey);
  const find = (aliases: readonly string[], label: string): number => {
    const wanted = aliases.map(headerKey);
    const idx = keys.findIndex((h) => h && wanted.includes(h));
    if (idx === -1) {
      throw new Error(
        `El archivo no trae la columna "${label}". Columnas encontradas: ${header
          .filter(Boolean)
          .join(" · ")}`,
      );
    }
    return idx;
  };
  return {
    name: find(ALEGRA_HEADERS.name, "Producto/servicio"),
    qtyPrincipal: find(ALEGRA_HEADERS.qtyPrincipal, "Cantidad en Principal"),
    qtyTotal: find(ALEGRA_HEADERS.qtyTotal, "Cantidad total"),
  };
}

export interface AlegraRow {
  rowNumber: number;
  name: string;
  qtyPrincipal: number;
  qtyTotal: number;
}

export interface AlegraTargets {
  rowNumber: number;
  name: string;
  principal: number;
  cutis: number;
}

export interface AlegraRowError {
  rowNumber: number;
  name: string;
  error: string;
}

/** Calcula el objetivo por sucursal de UNA fila, o el motivo por el que se omite. */
export function rowTargets(row: AlegraRow): AlegraTargets | AlegraRowError {
  const { rowNumber, name, qtyPrincipal, qtyTotal } = row;
  if (!Number.isFinite(qtyPrincipal) || !Number.isFinite(qtyTotal)) {
    return { rowNumber, name, error: "La cantidad no es un número." };
  }
  if (qtyPrincipal < 0 || qtyTotal < 0) {
    return { rowNumber, name, error: "Cantidad negativa en el archivo." };
  }
  if (qtyTotal < qtyPrincipal) {
    return {
      rowNumber,
      name,
      error: "La cantidad total es menor que la de Principal; la diferencia daría negativo.",
    };
  }
  return { rowNumber, name, principal: qtyPrincipal, cutis: qtyTotal - qtyPrincipal };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-import`
Expected: PASS (todos los casos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-import.ts apps/web/src/features/inventory/alegra-import.test.ts
git commit -m "feat(inventario): motor puro del importador Alegra (columnas por cabecera + objetivos por sucursal)"
```

---

### Task 2: Motor puro — plan de ajuste contra el stock actual

**Files:**
- Modify: `apps/web/src/features/inventory/alegra-import.ts`
- Test: `apps/web/src/features/inventory/alegra-import-plan.test.ts`

**Interfaces:**
- Consumes: de Task 1 — `AlegraTargets`, `AlegraRowError`, `normalizeProductName`, `rowTargets`.
- Produces:
  - `export interface PlanProduct { id: string; name: string }`
  - `export interface PlanLot { id: string; productId: string; warehouseId: string; quantity: number; expiresAt: string; receivedAt: string; lotNumber: string }`
  - `export interface BranchAdjustment { productId: string; productName: string; current: number; target: number; delta: number; lotChanges: Array<{ lotId: string; lotNumber: string; warehouseId: string; from: number; to: number }>; newLot?: { expiresAt: string; quantity: number; warehouseId: string } }`
  - `export interface ImportPlan { principal: BranchAdjustment[]; cutis: BranchAdjustment[]; skipped: AlegraRowError[]; unmatched: Array<{ rowNumber: number; name: string; principal: number; cutis: number }>; collisions: Array<{ productName: string; rows: number[] }>; totals: { principalBefore: number; principalAfter: number; cutisBefore: number; cutisAfter: number } }`
  - `export function buildImportPlan(input: { rows: AlegraRow[]; products: PlanProduct[]; principalLots: PlanLot[]; cutisLots: PlanLot[]; cutisWarehouseId: string; zeroMissing: boolean }): ImportPlan`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-import-plan.test.ts
import { describe, it, expect } from "vitest";
import { buildImportPlan, type PlanLot, type PlanProduct } from "./alegra-import";

const P = (id: string, name: string): PlanProduct => ({ id, name });
const L = (
  id: string,
  productId: string,
  quantity: number,
  expiresAt = "2027-01-31",
  receivedAt = "2026-01-01",
): PlanLot => ({ id, productId, warehouseId: "wh-prin", quantity, expiresAt, receivedAt, lotNumber: `LOT-${id}` });

const base = {
  products: [P("p1", "Crema 30 ML")],
  cutisWarehouseId: "wh-cutis",
  zeroMissing: false,
};

describe("buildImportPlan · Principal", () => {
  it("baja el stock consumiendo primero el lote que vence antes (FEFO)", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 5, qtyTotal: 5 }],
      principalLots: [L("a", "p1", 4, "2028-01-01"), L("b", "p1", 6, "2026-06-01")],
      cutisLots: [],
    });
    // total 10 → objetivo 5 ⇒ quitar 5: primero del lote "b" (vence antes)
    expect(plan.principal[0].delta).toBe(-5);
    expect(plan.principal[0].lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 6, to: 1 },
    ]);
  });

  it("reparte la baja entre varios lotes cuando uno no alcanza", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 4, "2028-01-01"), L("b", "p1", 6, "2026-06-01")],
      cutisLots: [],
    });
    expect(plan.principal[0].lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 6, to: 0 },
      { lotId: "a", lotNumber: "LOT-a", warehouseId: "wh-prin", from: 4, to: 1 },
    ]);
  });

  it("sube el stock en el lote recibido más recientemente", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 7, qtyTotal: 7 }],
      principalLots: [L("a", "p1", 2, "2028-01-01", "2026-01-01"), L("b", "p1", 3, "2026-06-01", "2026-05-01")],
      cutisLots: [],
    });
    expect(plan.principal[0].delta).toBe(2);
    expect(plan.principal[0].lotChanges).toEqual([
      { lotId: "b", lotNumber: "LOT-b", warehouseId: "wh-prin", from: 3, to: 5 },
    ]);
  });

  it("no genera ajuste cuando ya coincide (idempotencia)", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 4, qtyTotal: 4 }],
      principalLots: [L("a", "p1", 4)],
      cutisLots: [],
    });
    expect(plan.principal).toEqual([]);
  });
});

describe("buildImportPlan · Cutis", () => {
  it("crea un lote nuevo heredando el vencimiento del lote de Principal", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 3, qtyTotal: 8 }],
      principalLots: [L("a", "p1", 3, "2029-03-15")],
      cutisLots: [],
    });
    expect(plan.cutis[0]).toMatchObject({
      productId: "p1",
      current: 0,
      target: 5,
      delta: 5,
      newLot: { expiresAt: "2029-03-15", quantity: 5, warehouseId: "wh-cutis" },
    });
  });

  it("si el producto no tiene lote en Principal, no inventa fecha: lo omite", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 0, qtyTotal: 5 }],
      principalLots: [],
      cutisLots: [],
    });
    expect(plan.cutis).toEqual([]);
    expect(plan.skipped.map((s) => s.error).join()).toMatch(/vencimiento/i);
  });

  it("ajusta el lote existente de Cutis en vez de crear uno nuevo", () => {
    const cutis: PlanLot = { ...L("c", "p1", 9), warehouseId: "wh-cutis" };
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 4 }],
      principalLots: [L("a", "p1", 1)],
      cutisLots: [cutis],
    });
    expect(plan.cutis[0].delta).toBe(-6);
    expect(plan.cutis[0].newLot).toBeUndefined();
  });
});

describe("buildImportPlan · casos que no se aplican", () => {
  it("reporta las filas que no emparejan con ningún producto", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 5, name: "PRODUCTO QUE NO EXISTE", qtyPrincipal: 2, qtyTotal: 2 }],
      principalLots: [],
      cutisLots: [],
    });
    expect(plan.unmatched).toEqual([
      { rowNumber: 5, name: "PRODUCTO QUE NO EXISTE", principal: 2, cutis: 0 },
    ]);
  });

  it("suma las filas que apuntan al mismo producto y lo reporta", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [
        { rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 2, qtyTotal: 2 },
        { rowNumber: 3, name: "Crema 30 ML", qtyPrincipal: 3, qtyTotal: 3 },
      ],
      principalLots: [L("a", "p1", 0)],
      cutisLots: [],
    });
    expect(plan.principal[0].target).toBe(5);
    expect(plan.collisions).toEqual([{ productName: "Crema 30 ML", rows: [2, 3] }]);
  });

  it("con zeroMissing pone en 0 los productos ausentes del archivo", () => {
    const plan = buildImportPlan({
      ...base,
      products: [P("p1", "Crema 30 ML"), P("p2", "Otro")],
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 1), L("z", "p2", 12)],
      cutisLots: [],
      zeroMissing: true,
    });
    expect(plan.principal.find((a) => a.productId === "p2")).toMatchObject({ target: 0, delta: -12 });
  });

  it("sin zeroMissing deja intactos los productos ausentes", () => {
    const plan = buildImportPlan({
      ...base,
      products: [P("p1", "Crema 30 ML"), P("p2", "Otro")],
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 1, qtyTotal: 1 }],
      principalLots: [L("a", "p1", 1), L("z", "p2", 12)],
      cutisLots: [],
      zeroMissing: false,
    });
    expect(plan.principal.find((a) => a.productId === "p2")).toBeUndefined();
  });

  it("los totales reflejan el antes y el después de cada sucursal", () => {
    const plan = buildImportPlan({
      ...base,
      rows: [{ rowNumber: 2, name: "CREMA 30ML", qtyPrincipal: 2, qtyTotal: 6 }],
      principalLots: [L("a", "p1", 10, "2029-01-01")],
      cutisLots: [],
    });
    expect(plan.totals).toEqual({
      principalBefore: 10,
      principalAfter: 2,
      cutisBefore: 0,
      cutisAfter: 4,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-import-plan`
Expected: FAIL — `buildImportPlan is not a function`.

- [ ] **Step 3: Write minimal implementation**

Añadir al final de `apps/web/src/features/inventory/alegra-import.ts`:

```ts
export interface PlanProduct {
  id: string;
  name: string;
}

export interface PlanLot {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  /** ISO `YYYY-MM-DD`. */
  expiresAt: string;
  /** ISO. Para elegir el lote más reciente al SUBIR stock. */
  receivedAt: string;
  lotNumber: string;
}

export interface LotChange {
  lotId: string;
  lotNumber: string;
  warehouseId: string;
  from: number;
  to: number;
}

export interface BranchAdjustment {
  productId: string;
  productName: string;
  current: number;
  target: number;
  delta: number;
  lotChanges: LotChange[];
  /** Solo cuando hay que CREAR stock donde no existe ningún lote. */
  newLot?: { expiresAt: string; quantity: number; warehouseId: string };
}

export interface ImportPlan {
  principal: BranchAdjustment[];
  cutis: BranchAdjustment[];
  skipped: AlegraRowError[];
  unmatched: Array<{ rowNumber: number; name: string; principal: number; cutis: number }>;
  collisions: Array<{ productName: string; rows: number[] }>;
  totals: {
    principalBefore: number;
    principalAfter: number;
    cutisBefore: number;
    cutisAfter: number;
  };
}

function sumQty(lots: PlanLot[]): number {
  return lots.reduce((acc, l) => acc + l.quantity, 0);
}

/**
 * Calcula cómo repartir un delta dentro de los lotes existentes de un producto.
 *  - delta < 0 → consume por FEFO (primero el que vence antes).
 *  - delta > 0 → suma al lote recibido más recientemente.
 */
function distribute(lots: PlanLot[], delta: number): LotChange[] {
  if (delta === 0 || lots.length === 0) return [];
  if (delta > 0) {
    const newest = [...lots].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    return [
      {
        lotId: newest.id,
        lotNumber: newest.lotNumber,
        warehouseId: newest.warehouseId,
        from: newest.quantity,
        to: newest.quantity + delta,
      },
    ];
  }
  let pending = -delta;
  const changes: LotChange[] = [];
  const fefo = lots
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  for (const lot of fefo) {
    if (pending <= 0) break;
    const take = Math.min(pending, lot.quantity);
    changes.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      warehouseId: lot.warehouseId,
      from: lot.quantity,
      to: lot.quantity - take,
    });
    pending -= take;
  }
  return changes;
}

/**
 * Arma el plan completo de ajuste para las dos sucursales.
 *
 * `products`, `principalLots` y `cutisLots` los provee el SERVIDOR leyendo la
 * base; `rows` viene del archivo. Nada del archivo decide a qué negocio o
 * sucursal se escribe.
 */
export function buildImportPlan(input: {
  rows: AlegraRow[];
  products: PlanProduct[];
  principalLots: PlanLot[];
  cutisLots: PlanLot[];
  cutisWarehouseId: string;
  zeroMissing: boolean;
}): ImportPlan {
  const { rows, products, principalLots, cutisLots, cutisWarehouseId, zeroMissing } = input;

  const byName = new Map<string, PlanProduct[]>();
  for (const p of products) {
    const key = normalizeProductName(p.name);
    const list = byName.get(key);
    if (list) list.push(p);
    else byName.set(key, [p]);
  }

  const lotsOf = (lots: PlanLot[]): Map<string, PlanLot[]> => {
    const m = new Map<string, PlanLot[]>();
    for (const l of lots) {
      const list = m.get(l.productId);
      if (list) list.push(l);
      else m.set(l.productId, [l]);
    }
    return m;
  };
  const prinByProduct = lotsOf(principalLots);
  const cutisByProduct = lotsOf(cutisLots);

  const skipped: AlegraRowError[] = [];
  const unmatched: ImportPlan["unmatched"] = [];
  const targets = new Map<
    string,
    { product: PlanProduct; principal: number; cutis: number; rows: number[] }
  >();

  for (const row of rows) {
    const t = rowTargets(row);
    if ("error" in t) {
      skipped.push(t);
      continue;
    }
    const hits = byName.get(normalizeProductName(row.name)) ?? [];
    if (hits.length !== 1) {
      unmatched.push({
        rowNumber: t.rowNumber,
        name: row.name,
        principal: t.principal,
        cutis: t.cutis,
      });
      continue;
    }
    const product = hits[0];
    const acc = targets.get(product.id);
    if (acc) {
      acc.principal += t.principal;
      acc.cutis += t.cutis;
      acc.rows.push(t.rowNumber);
    } else {
      targets.set(product.id, {
        product,
        principal: t.principal,
        cutis: t.cutis,
        rows: [t.rowNumber],
      });
    }
  }

  const collisions = [...targets.values()]
    .filter((t) => t.rows.length > 1)
    .map((t) => ({ productName: t.product.name, rows: t.rows }));

  if (zeroMissing) {
    for (const p of products) {
      if (!targets.has(p.id)) {
        targets.set(p.id, { product: p, principal: 0, cutis: 0, rows: [] });
      }
    }
  }

  const principal: BranchAdjustment[] = [];
  const cutis: BranchAdjustment[] = [];

  for (const t of targets.values()) {
    const prinLots = prinByProduct.get(t.product.id) ?? [];
    const prinCurrent = sumQty(prinLots);
    const prinDelta = t.principal - prinCurrent;
    if (prinDelta !== 0) {
      if (prinLots.length === 0) {
        skipped.push({
          rowNumber: t.rows[0] ?? 0,
          name: t.product.name,
          error:
            "No tiene lote en Principal, así que no hay vencimiento del cual heredar. Recíbelo manualmente.",
        });
      } else {
        principal.push({
          productId: t.product.id,
          productName: t.product.name,
          current: prinCurrent,
          target: t.principal,
          delta: prinDelta,
          lotChanges: distribute(prinLots, prinDelta),
        });
      }
    }

    const cLots = cutisByProduct.get(t.product.id) ?? [];
    const cCurrent = sumQty(cLots);
    const cDelta = t.cutis - cCurrent;
    if (cDelta !== 0) {
      if (cLots.length > 0) {
        cutis.push({
          productId: t.product.id,
          productName: t.product.name,
          current: cCurrent,
          target: t.cutis,
          delta: cDelta,
          lotChanges: distribute(cLots, cDelta),
        });
      } else {
        // Hay que CREAR el lote en Cutis: hereda el vencimiento de Principal.
        const donor = [...prinLots].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];
        if (!donor) {
          skipped.push({
            rowNumber: t.rows[0] ?? 0,
            name: t.product.name,
            error:
              "Necesita stock en Cutis pero no tiene lote en Principal del cual heredar el vencimiento.",
          });
        } else {
          cutis.push({
            productId: t.product.id,
            productName: t.product.name,
            current: 0,
            target: t.cutis,
            delta: cDelta,
            lotChanges: [],
            newLot: { expiresAt: donor.expiresAt, quantity: t.cutis, warehouseId: cutisWarehouseId },
          });
        }
      }
    }
  }

  const principalBefore = sumQty(principalLots);
  const cutisBefore = sumQty(cutisLots);
  return {
    principal,
    cutis,
    skipped,
    unmatched,
    collisions,
    totals: {
      principalBefore,
      principalAfter: principalBefore + principal.reduce((a, x) => a + x.delta, 0),
      cutisBefore,
      cutisAfter: cutisBefore + cutis.reduce((a, x) => a + x.delta, 0),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-import`
Expected: PASS (Task 1 y Task 2, todos los casos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-import.ts apps/web/src/features/inventory/alegra-import-plan.test.ts
git commit -m "feat(inventario): plan de ajuste por sucursal (FEFO, lote heredado en Cutis, colisiones)"
```

---

### Task 3: Endpoint de vista previa (solo lectura)

**Files:**
- Create: `apps/web/src/app/api/inventory-import/preview/route.ts`
- Create: `apps/web/src/features/inventory/alegra-import-schema.ts`
- Test: `apps/web/src/features/inventory/alegra-import-schema.test.ts`

**Interfaces:**
- Consumes: de Task 2 — `buildImportPlan`, `AlegraRow`, `ImportPlan`.
- Produces:
  - `export const alegraImportBodySchema` (Zod) que valida `{ rows: AlegraRow[]; zeroMissing?: boolean }`, con tope de **5000 filas** y nombre de máximo **300 caracteres**.
  - `POST /api/inventory-import/preview` → `{ plan: ImportPlan; branches: { principal: string; cutis: string } }`
  - `export const INVENTORY_IMPORT_ROLES: ReadonlyArray<UserRole>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-import-schema.test.ts
import { describe, it, expect } from "vitest";
import { alegraImportBodySchema } from "./alegra-import-schema";

describe("alegraImportBodySchema", () => {
  it("acepta un body válido", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 1, qtyTotal: 2 }],
      zeroMissing: true,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza más de 5000 filas (tope anti-DoS)", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      rowNumber: i + 2, name: "X", qtyPrincipal: 0, qtyTotal: 0,
    }));
    expect(alegraImportBodySchema.safeParse({ rows }).success).toBe(false);
  });

  it("rechaza un nombre desmesurado", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X".repeat(301), qtyPrincipal: 0, qtyTotal: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza cantidades que no son enteros", () => {
    const r = alegraImportBodySchema.safeParse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 1.5, qtyTotal: 2 }],
    });
    expect(r.success).toBe(false);
  });

  it("zeroMissing por defecto es false", () => {
    const r = alegraImportBodySchema.parse({
      rows: [{ rowNumber: 2, name: "X", qtyPrincipal: 0, qtyTotal: 0 }],
    });
    expect(r.zeroMissing).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-import-schema`
Expected: FAIL — no existe `./alegra-import-schema`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/inventory/alegra-import-schema.ts
import { z } from "zod";
import type { UserRole } from "@/types";

/** Solo estos roles pueden previsualizar o aplicar una importación de inventario. */
export const INVENTORY_IMPORT_ROLES: ReadonlyArray<UserRole> = [
  "super_admin",
  "admin",
  "manager",
];

/** Tope de filas por importación (anti-DoS). El export real ronda 1400. */
export const MAX_IMPORT_ROWS = 5000;

const rowSchema = z.object({
  rowNumber: z.number().int().min(1).max(1_000_000),
  name: z.string().min(1).max(300),
  qtyPrincipal: z.number().int().min(-1_000_000).max(1_000_000),
  qtyTotal: z.number().int().min(-1_000_000).max(1_000_000),
});

export const alegraImportBodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS),
  zeroMissing: z.boolean().optional().default(false),
});
```

```ts
// apps/web/src/app/api/inventory-import/preview/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories, type RepoContext } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import {
  alegraImportBodySchema,
  INVENTORY_IMPORT_ROLES,
} from "@/features/inventory/alegra-import-schema";
import { buildImportPlan } from "@/features/inventory/alegra-import";
import { loadImportSources } from "@/features/inventory/alegra-import-sources";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de inventario en modo local (DATA_SOURCE=mock). Activa Supabase para importar.",
    },
    { status: 409 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  // Autorización ANTES de leer el body (patrón v0.98.0).
  const auth = await authorizeRole(INVENTORY_IMPORT_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = await parseJsonBody(req, alegraImportBodySchema);
  if (!parsed.ok) return parsed.res;

  try {
    const ctx: RepoContext = await getRepoContext();
    const repos = getRepositories();
    const sources = await loadImportSources(ctx, repos);
    const plan = buildImportPlan({
      rows: parsed.data.rows,
      products: sources.products,
      principalLots: sources.principalLots,
      cutisLots: sources.cutisLots,
      cutisWarehouseId: sources.cutisWarehouseId,
      zeroMissing: parsed.data.zeroMissing,
    });
    return NextResponse.json(
      { plan, branches: { principal: sources.principalName, cutis: sources.cutisName } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo analizar el archivo. Intenta de nuevo.") },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-import-schema`
Expected: PASS.

(El route handler todavía no compila: depende de `loadImportSources`, que se crea en la Task 4. No corras `typecheck` aún.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-import-schema.ts apps/web/src/features/inventory/alegra-import-schema.test.ts apps/web/src/app/api/inventory-import/preview/route.ts
git commit -m "feat(inventario): endpoint de vista previa del importador (validación Zod + gate de rol)"
```

---

### Task 4: Lectura de las fuentes (productos + lotes de ambas sucursales)

**Files:**
- Create: `apps/web/src/features/inventory/alegra-import-sources.ts`
- Test: `apps/web/src/features/inventory/alegra-import-sources.test.ts`

**Interfaces:**
- Consumes: de Task 2 — `PlanProduct`, `PlanLot`.
- Produces:
  - `export interface ImportSources { products: PlanProduct[]; principalLots: PlanLot[]; cutisLots: PlanLot[]; cutisWarehouseId: string; principalId: string; cutisId: string; principalName: string; cutisName: string }`
  - `export function pickImportBranches(branches: Array<{ id: string; name: string }>): { principal: { id: string; name: string }; cutis: { id: string; name: string } }` — resuelve las sucursales por nombre; lanza `Error` legible si falta alguna.
  - `export async function loadImportSources(ctx, repos): Promise<ImportSources>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-import-sources.test.ts
import { describe, it, expect } from "vitest";
import { pickImportBranches } from "./alegra-import-sources";

describe("pickImportBranches", () => {
  it("encuentra Principal y Cutis sin importar mayúsculas ni acentos", () => {
    const r = pickImportBranches([
      { id: "b1", name: "DermaLand Principal" },
      { id: "b2", name: "Dermaland Cutis" },
    ]);
    expect(r.principal.id).toBe("b1");
    expect(r.cutis.id).toBe("b2");
  });

  it("explica cuál falta en vez de fallar en silencio", () => {
    expect(() => pickImportBranches([{ id: "b1", name: "DermaLand Principal" }]))
      .toThrow(/Cutis/);
  });

  it("si hay dos que empatan, pide desambiguar", () => {
    expect(() =>
      pickImportBranches([
        { id: "b1", name: "DermaLand Principal" },
        { id: "b9", name: "Dermaland principal" },
        { id: "b2", name: "Dermaland Cutis" },
      ]),
    ).toThrow(/más de una/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-import-sources`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/inventory/alegra-import-sources.ts
import "server-only";
import type { RepoContext, Repositories } from "@/server/repositories";
import type { PlanLot, PlanProduct } from "./alegra-import";

export interface ImportSources {
  products: PlanProduct[];
  principalLots: PlanLot[];
  cutisLots: PlanLot[];
  cutisWarehouseId: string;
  principalId: string;
  cutisId: string;
  principalName: string;
  cutisName: string;
}

function key(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Resuelve qué sucursal es "Principal" y cuál "Cutis". El archivo de Alegra
 * solo desglosa "Principal"; el resto va a Cutis (decisión del dueño).
 * Falla con mensaje legible en vez de adivinar.
 */
export function pickImportBranches(
  branches: Array<{ id: string; name: string }>,
): { principal: { id: string; name: string }; cutis: { id: string; name: string } } {
  const find = (needle: string, label: string) => {
    const hits = branches.filter((b) => key(b.name).includes(needle));
    if (hits.length === 0) {
      throw new Error(
        `No se encontró la sucursal "${label}". Sucursales disponibles: ${branches
          .map((b) => b.name)
          .join(" · ")}`,
      );
    }
    if (hits.length > 1) {
      throw new Error(
        `Hay más de una sucursal que coincide con "${label}": ${hits
          .map((b) => b.name)
          .join(" · ")}. Renombra una para poder importar.`,
      );
    }
    return hits[0];
  };
  return { principal: find("principal", "Principal"), cutis: find("cutis", "Cutis") };
}

/**
 * Lee de la base todo lo que el motor necesita. Nada de esto viene del cliente.
 * Los repositorios ya paginan internamente (tope 1000 de PostgREST).
 */
export async function loadImportSources(
  ctx: RepoContext,
  repos: Repositories,
): Promise<ImportSources> {
  const branches = await repos.branch.list(ctx);
  const { principal, cutis } = pickImportBranches(
    branches.map((b) => ({ id: b.id, name: b.name })),
  );

  const products = (await repos.product.list(ctx)).map((p) => ({ id: p.id, name: p.name }));

  const warehouses = await repos.warehouse.list(ctx);
  const cutisWarehouse = warehouses.find((w) => w.branchId === cutis.id);
  if (!cutisWarehouse) {
    throw new Error(
      `La sucursal "${cutis.name}" no tiene almacén configurado; no se puede crear stock ahí.`,
    );
  }

  const toPlanLot = (l: {
    id: string;
    productId: string;
    warehouseId: string;
    currentQuantity: number;
    expiresAt: string;
    receivedAt: string;
    lotNumber: string;
  }): PlanLot => ({
    id: l.id,
    productId: l.productId,
    warehouseId: l.warehouseId,
    quantity: l.currentQuantity,
    expiresAt: l.expiresAt,
    receivedAt: l.receivedAt,
    lotNumber: l.lotNumber,
  });

  const allLots = await repos.productLot.list({ ...ctx, branchId: undefined });
  const principalLots = allLots.filter((l) => l.branchId === principal.id).map(toPlanLot);
  const cutisLots = allLots.filter((l) => l.branchId === cutis.id).map(toPlanLot);

  return {
    products,
    principalLots,
    cutisLots,
    cutisWarehouseId: cutisWarehouse.id,
    principalId: principal.id,
    cutisId: cutis.id,
    principalName: principal.name,
    cutisName: cutis.name,
  };
}
```

**Nota para el implementador:** verifica los nombres reales de los campos de `ProductLot` en `apps/web/src/types/index.ts` (p. ej. `currentQuantity` vs `current_quantity`, `expiresAt`, `receivedAt`, `branchId`) y ajusta `toPlanLot`. Si `repos.productLot.list` no acepta filtrar por sucursal, trae todos y filtra en memoria como arriba.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-import-sources`
Expected: PASS.

Luego: `pnpm --filter web typecheck` → debe pasar (ya existe `loadImportSources`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-import-sources.ts apps/web/src/features/inventory/alegra-import-sources.test.ts
git commit -m "feat(inventario): lectura de productos y lotes por sucursal para el importador"
```

---

### Task 5: Endpoint de aplicación

**Files:**
- Create: `apps/web/src/app/api/inventory-import/apply/route.ts`
- Create: `apps/web/src/features/inventory/alegra-import-apply.ts`
- Test: `apps/web/src/features/inventory/alegra-import-apply.test.ts`

**Interfaces:**
- Consumes: de Task 2 `ImportPlan`, `BranchAdjustment`; de Task 4 `ImportSources`.
- Produces:
  - `export interface ApplyResult { appliedPrincipal: number; appliedCutis: number; lotsUpdated: number; lotsCreated: number; movements: number; failures: Array<{ productName: string; error: string }>; reference: string }`
  - `export function importReference(now: Date): string` → `ALEGRA-YYYYMMDD-HHmm`
  - `export async function applyImportPlan(ctx, repos, plan, sources, reference): Promise<ApplyResult>`
  - `POST /api/inventory-import/apply` → `{ result: ApplyResult }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-import-apply.test.ts
import { describe, it, expect, vi } from "vitest";
import { applyImportPlan, importReference } from "./alegra-import-apply";
import type { ImportPlan } from "./alegra-import";

const sources = {
  products: [],
  principalLots: [],
  cutisLots: [],
  cutisWarehouseId: "wh-cutis",
  principalId: "b-prin",
  cutisId: "b-cutis",
  principalName: "DermaLand Principal",
  cutisName: "Dermaland Cutis",
};

const emptyPlan: ImportPlan = {
  principal: [], cutis: [], skipped: [], unmatched: [], collisions: [],
  totals: { principalBefore: 0, principalAfter: 0, cutisBefore: 0, cutisAfter: 0 },
};

function makeRepos() {
  return {
    productLot: {
      adjustQuantity: vi.fn().mockResolvedValue({ id: "l1" }),
      create: vi.fn().mockResolvedValue({ id: "new-lot" }),
    },
    inventoryMovement: { create: vi.fn().mockResolvedValue({ id: "m1" }) },
  } as never;
}

describe("importReference", () => {
  it("usa un formato estable y legible", () => {
    expect(importReference(new Date("2026-08-02T15:04:00Z"))).toMatch(/^ALEGRA-20260802-\d{4}$/);
  });
});

describe("applyImportPlan", () => {
  it("ajusta el lote y registra UN movimiento por producto", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [{
        productId: "p1", productName: "Crema", current: 10, target: 4, delta: -6,
        lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 10, to: 4 }],
      }],
    };
    const res = await applyImportPlan({} as never, repos, plan, sources, "ALEGRA-X");
    expect(repos.productLot.adjustQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-prin" }), "l1", 4,
    );
    expect(repos.inventoryMovement.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "adjustment_negative",
        quantity: 6,
        warehouseId: "wh-prin",
        reference: "ALEGRA-X",
      }),
    );
    expect(res).toMatchObject({ appliedPrincipal: 1, lotsUpdated: 1, movements: 1, failures: [] });
  });

  it("crea el lote en Cutis con el vencimiento heredado", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      cutis: [{
        productId: "p1", productName: "Crema", current: 0, target: 5, delta: 5,
        lotChanges: [],
        newLot: { expiresAt: "2029-03-15", quantity: 5, warehouseId: "wh-cutis" },
      }],
    };
    const res = await applyImportPlan({} as never, repos, plan, sources, "ALEGRA-X");
    expect(repos.productLot.create).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-cutis" }),
      expect.objectContaining({ productId: "p1", expiresAt: "2029-03-15", currentQuantity: 5 }),
    );
    expect(res).toMatchObject({ appliedCutis: 1, lotsCreated: 1, movements: 1 });
  });

  it("usa adjustment_positive cuando el stock sube", async () => {
    const repos = makeRepos();
    const plan: ImportPlan = {
      ...emptyPlan,
      principal: [{
        productId: "p1", productName: "Crema", current: 1, target: 3, delta: 2,
        lotChanges: [{ lotId: "l1", lotNumber: "L1", warehouseId: "wh-prin", from: 1, to: 3 }],
      }],
    };
    await applyImportPlan({} as never, repos, plan, sources, "ALEGRA-X");
    expect(repos.inventoryMovement.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "adjustment_positive", quantity: 2 }),
    );
  });

  it("un fallo no aborta el resto: lo reporta y sigue", async () => {
    const repos = makeRepos();
    repos.productLot.adjustQuantity = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ id: "l2" });
    const adj = (id: string) => ({
      productId: id, productName: id, current: 5, target: 1, delta: -4,
      lotChanges: [{ lotId: `l-${id}`, lotNumber: "L", warehouseId: "wh-prin", from: 5, to: 1 }],
    });
    const plan: ImportPlan = { ...emptyPlan, principal: [adj("p1"), adj("p2")] };
    const res = await applyImportPlan({} as never, repos, plan, sources, "ALEGRA-X");
    expect(res.failures).toHaveLength(1);
    expect(res.appliedPrincipal).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-import-apply`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/inventory/alegra-import-apply.ts
import "server-only";
import type { RepoContext, Repositories } from "@/server/repositories";
import type { BranchAdjustment, ImportPlan } from "./alegra-import";
import type { ImportSources } from "./alegra-import-sources";

export interface ApplyResult {
  appliedPrincipal: number;
  appliedCutis: number;
  lotsUpdated: number;
  lotsCreated: number;
  movements: number;
  failures: Array<{ productName: string; error: string }>;
  reference: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Referencia de auditoría estable: `ALEGRA-YYYYMMDD-HHmm` (UTC). */
export function importReference(now: Date): string {
  return (
    `ALEGRA-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  );
}

/**
 * Ejecuta el plan. Un fallo en un producto NO aborta el resto: se reporta y se
 * continúa, igual que el script `import-stock-principal-from-alegra.mjs`.
 *
 * `warehouse_id` es NOT NULL en `inventory_movements`: sale del lote afectado
 * (gotcha que costó una corrida el 2026-08-01).
 */
export async function applyImportPlan(
  ctx: RepoContext,
  repos: Repositories,
  plan: ImportPlan,
  sources: ImportSources,
  reference: string,
): Promise<ApplyResult> {
  const res: ApplyResult = {
    appliedPrincipal: 0,
    appliedCutis: 0,
    lotsUpdated: 0,
    lotsCreated: 0,
    movements: 0,
    failures: [],
    reference,
  };
  const reason = `Importación Alegra ${reference} — ajuste de inventario a conteo real`;

  const runBranch = async (
    adjustments: BranchAdjustment[],
    branchId: string,
    counter: "appliedPrincipal" | "appliedCutis",
  ) => {
    const branchCtx: RepoContext = { ...ctx, branchId };
    for (const adj of adjustments) {
      try {
        let lotId: string;
        let warehouseId: string;

        if (adj.newLot) {
          const created = await repos.productLot.create(branchCtx, {
            businessId: ctx.businessId,
            branchId,
            productId: adj.productId,
            warehouseId: adj.newLot.warehouseId,
            lotNumber: `AJU-${reference}`,
            expiresAt: adj.newLot.expiresAt,
            receivedAt: new Date().toISOString(),
            initialQuantity: adj.newLot.quantity,
            currentQuantity: adj.newLot.quantity,
            unitCost: 0,
            status: "available",
          } as never);
          res.lotsCreated++;
          lotId = created.id;
          warehouseId = adj.newLot.warehouseId;
        } else {
          for (const change of adj.lotChanges) {
            await repos.productLot.adjustQuantity(branchCtx, change.lotId, change.to);
            res.lotsUpdated++;
          }
          lotId = adj.lotChanges[0].lotId;
          warehouseId = adj.lotChanges[0].warehouseId;
        }

        await repos.inventoryMovement.create(branchCtx, {
          businessId: ctx.businessId,
          branchId,
          productId: adj.productId,
          lotId,
          warehouseId,
          type: adj.delta > 0 ? "adjustment_positive" : "adjustment_negative",
          quantity: Math.abs(adj.delta),
          reason,
          reference,
          userId: ctx.userId,
          userName: ctx.userName,
        } as never);
        res.movements++;
        res[counter]++;
      } catch (e) {
        res.failures.push({
          productName: adj.productName,
          error: e instanceof Error ? e.message : "Error desconocido",
        });
      }
    }
  };

  await runBranch(plan.principal, sources.principalId, "appliedPrincipal");
  await runBranch(plan.cutis, sources.cutisId, "appliedCutis");
  return res;
}
```

```ts
// apps/web/src/app/api/inventory-import/apply/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories, type RepoContext } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { parseJsonBody } from "@/server/http/parse-body";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import {
  alegraImportBodySchema,
  INVENTORY_IMPORT_ROLES,
} from "@/features/inventory/alegra-import-schema";
import { buildImportPlan } from "@/features/inventory/alegra-import";
import { loadImportSources } from "@/features/inventory/alegra-import-sources";
import { applyImportPlan, importReference } from "@/features/inventory/alegra-import-apply";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Backend de inventario en modo local (DATA_SOURCE=mock). Activa Supabase para importar." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(INVENTORY_IMPORT_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = await parseJsonBody(req, alegraImportBodySchema);
  if (!parsed.ok) return parsed.res;

  try {
    const ctx: RepoContext = await getRepoContext();
    const repos = getRepositories();
    const sources = await loadImportSources(ctx, repos);
    // El plan se RECALCULA en el servidor: el cliente nunca dicta qué escribir.
    const plan = buildImportPlan({
      rows: parsed.data.rows,
      products: sources.products,
      principalLots: sources.principalLots,
      cutisLots: sources.cutisLots,
      cutisWarehouseId: sources.cutisWarehouseId,
      zeroMissing: parsed.data.zeroMissing,
    });
    const result = await applyImportPlan(
      ctx,
      repos,
      plan,
      sources,
      importReference(new Date()),
    );
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo aplicar la importación. Intenta de nuevo.") },
      { status: 400 },
    );
  }
}
```

**Nota:** ajusta los nombres de campo de `productLot.create` y `inventoryMovement.create` a los tipos reales de `@/types` (`ProductLot`, `InventoryMovement`) y elimina los `as never` una vez que compilen.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-import-apply` → PASS
Run: `pnpm --filter web typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-import-apply.ts apps/web/src/features/inventory/alegra-import-apply.test.ts apps/web/src/app/api/inventory-import/apply/route.ts
git commit -m "feat(inventario): endpoint de aplicación del importador (ajuste + lote heredado + bitácora)"
```

---

### Task 6: Parseo del `.xlsx` en el cliente

**Files:**
- Create: `apps/web/src/features/inventory/alegra-workbook.ts`
- Test: `apps/web/src/features/inventory/alegra-workbook.test.ts`

**Interfaces:**
- Consumes: de Task 1 — `resolveColumns`, `AlegraRow`.
- Produces: `export function rowsFromMatrix(matrix: string[][]): AlegraRow[]` y `export async function readAlegraWorkbook(file: File): Promise<AlegraRow[]>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/inventory/alegra-workbook.test.ts
import { describe, it, expect } from "vitest";
import { rowsFromMatrix } from "./alegra-workbook";

const HEADER = [
  "Categoría", "Producto/servicio", "Referencia", "Descripción",
  "Cantidad en Principal", "Cantidad mínima en Principal",
  "Cantidad máxima en Principal", "Cantidad total",
];

describe("rowsFromMatrix", () => {
  it("lee nombre de la columna B y cantidades de E y H", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "desc", "3", "0", "0", "8"]]);
    expect(rows).toEqual([{ rowNumber: 2, name: "CREMA X", qtyPrincipal: 3, qtyTotal: 8 }]);
  });

  it("descarta filas sin nombre", () => {
    const rows = rowsFromMatrix([HEADER, ["", "", "", "", "1", "0", "0", "1"]]);
    expect(rows).toEqual([]);
  });

  it("trata celdas vacías o no numéricas como 0", () => {
    const rows = rowsFromMatrix([HEADER, ["", "CREMA X", "", "", "", "0", "0", "n/a"]]);
    expect(rows[0]).toMatchObject({ qtyPrincipal: 0, qtyTotal: 0 });
  });

  it("numera las filas como en Excel (la 1 es la cabecera)", () => {
    const rows = rowsFromMatrix([
      HEADER,
      ["", "A", "", "", "1", "0", "0", "1"],
      ["", "B", "", "", "2", "0", "0", "2"],
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("propaga el error de cabecera faltante", () => {
    expect(() => rowsFromMatrix([["Producto/servicio"], ["X"]])).toThrow(/Cantidad en Principal/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- alegra-workbook`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/inventory/alegra-workbook.ts
import { resolveColumns, type AlegraRow } from "./alegra-import";

/** Entero tolerante: celdas vacías o no numéricas cuentan como 0. */
function toInt(raw: string): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convierte una matriz de texto (fila 1 = cabecera) en filas del importador.
 * `rowNumber` es el número de fila REAL de Excel, para que el usuario pueda
 * localizar el problema en su archivo.
 */
export function rowsFromMatrix(matrix: string[][]): AlegraRow[] {
  const [header, ...body] = matrix;
  const col = resolveColumns(header ?? []);
  const out: AlegraRow[] = [];
  body.forEach((cells, i) => {
    const name = String(cells[col.name] ?? "").trim();
    if (!name) return;
    out.push({
      rowNumber: i + 2,
      name,
      qtyPrincipal: toInt(cells[col.qtyPrincipal]),
      qtyTotal: toInt(cells[col.qtyTotal]),
    });
  });
  return out;
}

/**
 * Lee un `.xlsx` en el navegador y devuelve las filas del importador.
 * ExcelJS se carga on-demand: pesa ~100 kB gz y solo hace falta al importar.
 */
export async function readAlegraWorkbook(file: File): Promise<AlegraRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("El archivo no tiene ninguna hoja de cálculo.");

  const matrix: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = ws.getRow(r).getCell(c).value;
      let text = "";
      if (v != null) {
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          if ("result" in o) text = String(o.result ?? "");
          else if ("text" in o) text = String(o.text ?? "");
          else if ("richText" in o)
            text = (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
          else text = String(v);
        } else {
          text = String(v);
        }
      }
      cells.push(text);
    }
    matrix.push(cells);
  }
  return rowsFromMatrix(matrix);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- alegra-workbook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inventory/alegra-workbook.ts apps/web/src/features/inventory/alegra-workbook.test.ts
git commit -m "feat(inventario): lectura del xlsx de Alegra en el navegador"
```

---

### Task 7: Pantalla de importación

**Files:**
- Create: `apps/web/src/app/(app)/inventario/importar/page.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx:131` (agregar el ítem tras "Recall")

**Interfaces:**
- Consumes: de Task 6 `readAlegraWorkbook`; de Task 3/5 los endpoints; de Task 2 el tipo `ImportPlan`.
- Produces: la ruta `/inventario/importar`.

- [ ] **Step 1: Agregar el ítem al menú**

En `apps/web/src/components/layout/sidebar.tsx`, dentro del grupo de Inventario, después de `{ label: "Recall", href: "/inventario/recall" }`:

```tsx
      { label: "Importar desde Alegra", href: "/inventario/importar" },
```

- [ ] **Step 2: Crear la página**

```tsx
// apps/web/src/app/(app)/inventario/importar/page.tsx
"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { readAlegraWorkbook } from "@/features/inventory/alegra-workbook";
import type { AlegraRow, ImportPlan } from "@/features/inventory/alegra-import";

type Branches = { principal: string; cutis: string };

export default function ImportarInventarioPage() {
  const { push } = useToast();
  const [rows, setRows] = React.useState<AlegraRow[] | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [branches, setBranches] = React.useState<Branches | null>(null);
  const [zeroMissing, setZeroMissing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [applied, setApplied] = React.useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setPlan(null);
    setApplied(null);
    try {
      const parsed = await readAlegraWorkbook(file);
      setRows(parsed);
      setFileName(file.name);
      push({ variant: "success", title: `${parsed.length} filas leídas de ${file.name}` });
    } catch (err) {
      setRows(null);
      push({
        variant: "error",
        title: "No se pudo leer el archivo",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const preview = React.useCallback(async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, zeroMissing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al analizar");
      setPlan(json.plan as ImportPlan);
      setBranches(json.branches as Branches);
    } catch (err) {
      push({
        variant: "error",
        title: "No se pudo analizar",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [rows, zeroMissing, push]);

  React.useEffect(() => {
    if (rows) void preview();
  }, [rows, zeroMissing, preview]);

  const apply = async () => {
    if (!rows || !plan) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, zeroMissing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al aplicar");
      setApplied(json.result.reference as string);
      push({
        variant: "success",
        title: "Inventario actualizado",
        description: `Referencia ${json.result.reference}`,
      });
      setPlan(null);
      setRows(null);
    } catch (err) {
      push({
        variant: "error",
        title: "No se pudo aplicar",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const changes = plan ? plan.principal.length + plan.cutis.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar desde Alegra"
        description="Actualiza el stock de las dos sucursales con el export de inventario de Alegra. Nada se guarda hasta que confirmes."
      />

      <Card>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 p-6 hover:bg-slate-50">
            <Upload className="h-5 w-5 text-slate-500" aria-hidden />
            <span className="text-sm text-slate-700">
              {fileName || "Elige el archivo .xlsx exportado de Alegra"}
            </span>
            <input type="file" accept=".xlsx" className="sr-only" onChange={onFile} disabled={busy} />
          </label>

          <p className="text-xs text-slate-500">
            Se usa la columna <strong>Cantidad en Principal</strong> para
            {branches ? ` ${branches.principal}` : " la sucursal principal"}, y la diferencia
            contra <strong>Cantidad total</strong> para
            {branches ? ` ${branches.cutis}` : " la segunda sucursal"}.
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={zeroMissing}
              onChange={(e) => setZeroMissing(e.target.checked)}
              disabled={busy}
            />
            Poner en cero los productos que no aparezcan en el archivo
          </label>
        </CardContent>
      </Card>

      {applied && (
        <Card>
          <CardContent>
            <p className="text-sm text-emerald-700">
              Importación aplicada. Referencia de auditoría <strong>{applied}</strong>. Puedes
              revisar cada ajuste en Inventario → Movimientos.
            </p>
          </CardContent>
        </Card>
      )}

      {plan && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["principal", branches?.principal ?? "Principal", plan.totals.principalBefore, plan.totals.principalAfter, plan.principal.length],
              ["cutis", branches?.cutis ?? "Cutis", plan.totals.cutisBefore, plan.totals.cutisAfter, plan.cutis.length],
            ] as const).map(([key, label, before, after, n]) => (
              <Card key={key}>
                <CardContent>
                  <p className="text-sm font-medium text-slate-900">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {before} → {after} <span className="text-sm font-normal text-slate-500">unidades</span>
                  </p>
                  <p className="text-xs text-slate-500">{n} productos cambian</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {(plan.unmatched.length > 0 || plan.skipped.length > 0 || plan.collisions.length > 0) && (
            <Card>
              <CardContent className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Filas que no se aplican
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {plan.unmatched.length > 0 && (
                    <li>{plan.unmatched.length} no coinciden con ningún producto del catálogo.</li>
                  )}
                  {plan.skipped.length > 0 && <li>{plan.skipped.length} se omiten por datos inválidos.</li>}
                  {plan.collisions.length > 0 && (
                    <li>{plan.collisions.length} productos reciben varias filas (se suman).</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-4">
              <Table>
                <THead>
                  <TR>
                    <TH>Producto</TH>
                    <TH>Sucursal</TH>
                    <TH className="text-right">Actual</TH>
                    <TH className="text-right">Nuevo</TH>
                    <TH className="text-right">Cambio</TH>
                  </TR>
                </THead>
                <TBody>
                  {[
                    ...plan.principal.map((a) => ({ ...a, branch: branches?.principal ?? "Principal" })),
                    ...plan.cutis.map((a) => ({ ...a, branch: branches?.cutis ?? "Cutis" })),
                  ]
                    .slice(0, 100)
                    .map((a) => (
                      <TR key={`${a.branch}-${a.productId}`}>
                        <TD>{a.productName}</TD>
                        <TD>{a.branch}</TD>
                        <TD className="text-right tabular-nums">{a.current}</TD>
                        <TD className="text-right tabular-nums">{a.target}</TD>
                        <TD className="text-right tabular-nums">
                          {a.delta > 0 ? `+${a.delta}` : a.delta}
                        </TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
              {changes > 100 && (
                <p className="text-xs text-slate-500">Mostrando los primeros 100 de {changes} cambios.</p>
              )}
              <Button onClick={apply} disabled={busy || changes === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
                Aplicar {changes} cambios
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {!plan && !rows && !applied && (
        <EmptyState
          title="Sin archivo cargado"
          description="Sube el export de inventario de Alegra para ver qué cambiaría antes de aplicarlo."
        />
      )}
    </div>
  );
}
```

**Nota:** ajusta los props de `PageHeader`, `EmptyState` y `useToast` a las firmas reales del proyecto (revisa `conteo-fisico/page.tsx` como referencia viva).

- [ ] **Step 3: Verificar en el navegador**

```bash
pnpm --filter web dev
```

Abre `http://localhost:3031/inventario/importar`, sube
`~/Downloads/Cantidad de productos - Dermaland principal (1).xlsx` y confirma que:
- lee 1370 filas,
- muestra los dos totales por sucursal,
- lista los cambios,
- **no** escribe nada hasta pulsar "Aplicar".

- [ ] **Step 4: Validar el proyecto completo**

```bash
pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build
```
Expected: los tres verdes.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/inventario/importar/page.tsx" apps/web/src/components/layout/sidebar.tsx
git commit -m "feat(inventario): pantalla Importar desde Alegra (vista previa por sucursal + aplicar)"
```

---

### Task 8: Documentación y versión

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `docs/estado-actual.md`, `docs/proximos-pasos.md`
- Create: `docs/importador-alegra.md`

- [ ] **Step 1: Escribir la guía de uso**

Crear `docs/importador-alegra.md` con este contenido:

```markdown
# Importar inventario desde Alegra

Actualiza el stock de las dos sucursales con un solo archivo. Vive en
**Inventario → Importar desde Alegra** (`/inventario/importar`).

## Qué exportar de Alegra

El reporte de inventario que incluye las columnas `Producto/servicio`,
`Cantidad en Principal` y `Cantidad total` (p. ej. "Valor de inventario" o
"Cantidad de productos"). No hace falta recortar columnas: el sistema las ubica
por el nombre de la cabecera, no por la posición.

## Qué hace con cada columna

| Columna de Alegra | Va a |
|---|---|
| `Cantidad en Principal` | Stock de **DermaLand Principal** |
| `Cantidad total` − `Cantidad en Principal` | Stock de **Dermaland Cutis** |

Alegra solo desglosa el almacén "Principal"; el resto del total se asume en
Cutis. Si alguna fila trae `Cantidad total` menor que `Cantidad en Principal`,
se reporta y se omite (daría un negativo).

## Quién puede usarlo

`super_admin`, `admin` y `manager`. Los demás roles reciben 403.

## Qué NO hace

- **No toca precios, costos ni códigos de barra.** Solo cantidades.
- **No crea productos.** Las filas que no coinciden con el catálogo se reportan
  y se omiten.
- **No importa vencimientos.** Cuando hay que crear stock en Cutis para un
  producto que no tenía lote ahí, el lote nuevo **hereda el vencimiento** del
  lote que ese producto ya tiene en Principal. Si no tiene ninguno, se omite y
  se reporta: hay que recibirlo a mano con su lote y vencimiento reales.

## "Poner en cero los productos que no aparezcan en el archivo"

Casilla opcional, apagada por defecto. Encendida, trata el archivo como el
inventario COMPLETO: todo producto del catálogo que no venga en el archivo
queda en 0. Úsala solo si el export cubre todo el catálogo.

## Cómo revisar o revertir

Cada ajuste deja un movimiento en **Inventario → Movimientos** con la
referencia `ALEGRA-YYYYMMDD-HHmm`. Filtra por esa referencia para ver todo lo
que cambió en esa importación.

## Antes de la primera vez

Toma un respaldo:

    node scripts/backup/rest-json-backup.mjs
    node scripts/backup/verify-backup-integrity.mjs

## Ojo con las ventas posteriores al export

El archivo es una foto del momento en que lo exportaste. Si DermaLand facturó
después de esa foto, aplicar el archivo devuelve al stock las unidades vendidas.
Exporta de Alegra justo antes de importar.
```

- [ ] **Step 2: CHANGELOG + versión**

En `CHANGELOG.md`, bajo `## [Unreleased]`, insertar:

```markdown
## [0.99.0] - 2026-08-02

**Importador de inventario desde Alegra (Inventario → Importar desde Alegra).**

- Nueva pantalla `/inventario/importar` (roles `super_admin`/`admin`/`manager`):
  se sube el export de inventario de Alegra, se ve el plan de cambios por
  sucursal y **nada se escribe hasta confirmar**.
- **Reparto por sucursal:** `Cantidad en Principal` → DermaLand Principal;
  `Cantidad total − Cantidad en Principal` → Dermaland Cutis. La resta se valida
  para que nunca produzca negativos.
- Las columnas se ubican por el **texto de la cabecera**, no por posición, así
  que acepta los distintos export de Alegra sin recortar nada.
- **Los lotes nuevos en Cutis heredan el vencimiento** del lote que el producto
  tiene en Principal (`product_lots.expires_at` es NOT NULL y el archivo no trae
  fechas). Si el producto no tiene lote en Principal, se reporta y se omite: no
  se inventan vencimientos.
- Los ajustes bajan por FEFO (primero lo que vence antes) y suben al lote más
  reciente. Cada producto deja un `inventory_movements`
  (`adjustment_positive`/`negative`) con referencia `ALEGRA-YYYYMMDD-HHmm`.
- No toca `products` (ni precio, ni costo, ni código de barras) y no crea
  productos: lo que no empareja se reporta.
- Casilla opcional para poner en cero los productos ausentes del archivo.
- Guía de uso en `docs/importador-alegra.md`.
```

Y en `package.json` subir `"version"` a `"0.99.0"`.

- [ ] **Step 3: Actualizar la memoria del proyecto**

En `docs/estado-actual.md`, agregar al inicio (bajo el encabezado) una sección
`## 2026-08-02 · Importador de inventario Alegra` que resuma: la ruta, los roles,
el reparto Principal/Cutis, la herencia de vencimiento, y que la carga por script
(`scripts/import-stock-principal-from-alegra.mjs`) queda como herramienta de
respaldo pero el camino normal ahora es la pantalla.

En `docs/proximos-pasos.md`, dentro de "Prioridad 2 — mejoras de UX", añadir:

```markdown
- [ ] Resolver en la app los casi-duplicados del catálogo (p. ej. `Regener
      Crema..` vs `REGENER CREMA`, `Primaderm … Antural` vs `… Natural`): hoy el
      importador los reporta como "no coinciden" y hay que arreglarlos a mano.
- [ ] Cargar los precios que faltan: 1 339 de 1 355 productos tienen `price = 0`
      y el POS no los deja vender. El export `Productos-servicios` de Alegra los
      trae; diseño en `docs/superpowers/specs/2026-08-01-importador-alegra-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json docs/
git commit -m "docs(inventario): guía del importador de Alegra + estado y versión (v0.99.0)"
```

---

## Notas de verificación final

Antes de dar el trabajo por terminado:

1. `pnpm --filter web typecheck` · `pnpm --filter web test` · `pnpm --filter web build` — los tres verdes.
2. Probar con un usuario **cajero**: `/inventario/importar` no debe permitir aplicar (403 del endpoint).
3. Subir el archivo dos veces seguidas: la segunda debe reportar **0 cambios** (idempotencia).
4. Tras aplicar, verificar en Inventario → Movimientos que existen los `adjustment_*` con la referencia `ALEGRA-…`.
5. **Respaldo antes de la primera aplicación real** (`node scripts/backup/rest-json-backup.mjs` + `verify-backup-integrity.mjs`), por la regla de control de cambios a producción.
