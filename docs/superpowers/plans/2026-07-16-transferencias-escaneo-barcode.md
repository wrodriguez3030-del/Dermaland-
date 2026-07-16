# Escaneo de código de barra en Nueva Transferencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir agregar productos a una transferencia entre sucursales escaneando su código de barra (lector USB o cámara), reutilizando la infraestructura de escaneo del módulo de Inventario físico.

**Architecture:** Una función pura `applyTransferScan` resuelve `código → producto → lote FEFO → nuevas filas`, con pruebas unitarias. La página `nueva/page.tsx` agrega una barra de escaneo (input con foco para lector USB + botón de cámara con `BarcodeScanModal`) que llama a esa función y actualiza el estado de filas. No se toca `createTransfer`, el modelo de datos ni el backend.

**Tech Stack:** Next.js (App Router, client component), React, TypeScript, Vitest, lucide-react, componentes UI internos (`@/components/ui`).

## Global Constraints

- Trabajar SIEMPRE en `C:\dev\dermaland` (repo local; nunca desde OneDrive/Google Drive).
- Rama de trabajo: `feat/transferencias-escaneo-barcode` (ya creada; NO commitear a `main`, un push a `main` = deploy vivo).
- Runner de tests: `pnpm test` (`vitest run`) desde `C:\dev\dermaland\apps\web`.
- Entorno de vitest: `node`, `globals: true`, alias `@` → `apps/web/src`.
- Fuente de datos del matcheo: usar `listAllProducts()` (catálogo local del `product-store`), la MISMA fuente local que `listAllLots()`. NO usar el hook `useProducts()` (en modo Supabase puede devolver productos con IDs distintos a `lot.productId` local y romper el match).
- Resolución de lote: FEFO (menor `expiresAt` primero). Cantidad: +1 por escaneo, campo editable.

---

## File Structure

- **Create** `apps/web/src/features/inventory/transfer-scan.ts` — función pura `applyTransferScan` + tipos `TransferRow` / `TransferScanOutcome`.
- **Create** `apps/web/src/features/inventory/transfer-scan.test.ts` — pruebas unitarias de `applyTransferScan`.
- **Modify** `apps/web/src/app/(app)/inventario/transferencias/nueva/page.tsx` — barra de escaneo (input + cámara), estado, `handleScan`, modal de cámara; reemplazar la interfaz local `Row` por `TransferRow`.

---

## Task 1: Función pura `applyTransferScan` + pruebas

**Files:**
- Create: `apps/web/src/features/inventory/transfer-scan.ts`
- Test: `apps/web/src/features/inventory/transfer-scan.test.ts`

**Interfaces:**
- Consumes: `findProductByCode(products: Product[], rawCode: string): Product | undefined` desde `@/features/inventory-counts/scan-session-store` (ya existe y ya se prueba en `scan-session-store.test.ts`, import seguro en entorno node). Tipos `Product`, `ProductLot` desde `@/types`.
- Produces:
  - `interface TransferRow { lotId: string; quantity: string }`
  - `type TransferScanOutcome` (unión con `result`: `"no_origin" | "empty" | "not_found" | "no_stock" | "added" | "incremented" | "at_max"`).
  - `function applyTransferScan(args: ApplyTransferScanArgs): TransferScanOutcome`
  - `interface ApplyTransferScanArgs { code: string; originSelected: boolean; rows: TransferRow[]; availableLots: ProductLot[]; products: Product[] }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/inventory/transfer-scan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyTransferScan, type TransferRow } from "./transfer-scan";
import type { Product, ProductLot } from "@/types";

// ── Fixtures mínimos (solo los campos que usa la lógica) ─────────────────────
function product(id: string, over: Partial<Product> = {}): Product {
  return {
    id,
    sku: `SKU-${id}`,
    barcode: `BC-${id}`,
    name: `Producto ${id}`,
    unit: "unidad",
    requiresPrescription: false,
    controlled: false,
    cost: 0,
    price: 0,
    itbisRate: 0,
    minStock: 0,
    maxStock: 0,
    active: true,
    sellable: true,
    businessId: "biz",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  } as Product;
}

function lot(
  id: string,
  productId: string,
  qty: number,
  expiresAt: string,
): ProductLot {
  return {
    id,
    productId,
    warehouseId: "wh1",
    lotNumber: `L-${id}`,
    expiresAt,
    receivedAt: "2026-01-01",
    initialQuantity: qty,
    currentQuantity: qty,
    unitCost: 0,
    status: "available",
    branchId: "origin",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as ProductLot;
}

const products = [product("A"), product("B")];
const emptyRows: TransferRow[] = [{ lotId: "", quantity: "" }];

describe("applyTransferScan", () => {
  it("sin origen seleccionado devuelve no_origin", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: false,
      rows: emptyRows,
      availableLots: [],
      products,
    });
    expect(r.result).toBe("no_origin");
  });

  it("código en blanco devuelve empty", () => {
    const r = applyTransferScan({
      code: "   ",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r.result).toBe("empty");
  });

  it("código desconocido devuelve not_found", () => {
    const r = applyTransferScan({
      code: "NO-EXISTE",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r).toMatchObject({ result: "not_found", code: "NO-EXISTE" });
  });

  it("producto sin lotes en origen devuelve no_stock", () => {
    const r = applyTransferScan({
      code: "BC-B",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-12-01")],
      products,
    });
    expect(r.result).toBe("no_stock");
  });

  it("agrega el lote FEFO en la fila vacía con cantidad 1", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: emptyRows,
      availableLots: [
        lot("late", "A", 5, "2027-01-01"),
        lot("fefo", "A", 5, "2026-06-01"),
      ],
      products,
    });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.lot.id).toBe("fefo"); // vencimiento más próximo
      expect(r.quantity).toBe(1);
      expect(r.rows[0]).toEqual({ lotId: "fefo", quantity: "1" });
      // No debe agregar filas nuevas: reutiliza la vacía.
      expect(r.rows).toHaveLength(1);
    }
  });

  it("agrega una fila nueva si no hay filas vacías", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "otro", quantity: "2" }],
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("added");
    if (r.result === "added") {
      expect(r.rows).toHaveLength(2);
      expect(r.rows[1]).toEqual({ lotId: "l1", quantity: "1" });
    }
  });

  it("escaneo repetido incrementa la cantidad de la fila existente", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "l1", quantity: "1" }],
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("incremented");
    if (r.result === "incremented") {
      expect(r.quantity).toBe(2);
      expect(r.rows[0]).toEqual({ lotId: "l1", quantity: "2" });
    }
  });

  it("no supera el stock del lote: topa en el máximo (at_max)", () => {
    const r = applyTransferScan({
      code: "BC-A",
      originSelected: true,
      rows: [{ lotId: "l1", quantity: "3" }],
      availableLots: [lot("l1", "A", 3, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("at_max");
    if (r.result === "at_max") {
      expect(r.quantity).toBe(3);
      expect(r.rows[0]).toEqual({ lotId: "l1", quantity: "3" });
    }
  });

  it("matchea también por SKU (case-insensitive)", () => {
    const r = applyTransferScan({
      code: "sku-a",
      originSelected: true,
      rows: emptyRows,
      availableLots: [lot("l1", "A", 5, "2026-06-01")],
      products,
    });
    expect(r.result).toBe("added");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/features/inventory/transfer-scan.test.ts`
Expected: FAIL — no puede resolver `./transfer-scan` (módulo aún no existe).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/features/inventory/transfer-scan.ts`:

```ts
import type { Product, ProductLot } from "@/types";
import { findProductByCode } from "@/features/inventory-counts/scan-session-store";

/** Fila de la tabla de transferencia (producto+cantidad como string editable). */
export interface TransferRow {
  lotId: string;
  quantity: string;
}

export type TransferScanOutcome =
  | { result: "no_origin" }
  | { result: "empty" }
  | { result: "not_found"; code: string }
  | { result: "no_stock"; product: Product }
  | {
      result: "added" | "incremented" | "at_max";
      product: Product;
      lot: ProductLot;
      rows: TransferRow[];
      quantity: number;
    };

export interface ApplyTransferScanArgs {
  /** Código crudo escaneado o escrito. */
  code: string;
  /** Si hay sucursal origen seleccionada. */
  originSelected: boolean;
  /** Filas actuales de la tabla. */
  rows: TransferRow[];
  /** Lotes `available` de la sucursal origen con `currentQuantity > 0`. */
  availableLots: ProductLot[];
  /** Catálogo local (misma fuente que availableLots) para matchear el código. */
  products: Product[];
}

/** FEFO: vencimiento más próximo primero. */
function byFefo(a: ProductLot, b: ProductLot): number {
  return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
}

/**
 * Resuelve un escaneo en la pantalla de transferencia: código → producto →
 * lote FEFO en el origen → nuevas filas. Función pura (sin efectos): la página
 * aplica `outcome.rows` y muestra el feedback según `outcome.result`.
 */
export function applyTransferScan(args: ApplyTransferScanArgs): TransferScanOutcome {
  const { originSelected, products, availableLots, rows } = args;
  const code = args.code.trim();

  if (!originSelected) return { result: "no_origin" };
  if (!code) return { result: "empty" };

  const product = findProductByCode(products, code);
  if (!product) return { result: "not_found", code };

  const lots = availableLots
    .filter((l) => l.productId === product.id)
    .sort(byFefo);
  if (lots.length === 0) return { result: "no_stock", product };

  // ¿Ya hay una fila con un lote de este producto? → incrementar.
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const existingIdx = rows.findIndex((r) => lotById.has(r.lotId));

  if (existingIdx >= 0) {
    const row = rows[existingIdx]!;
    const lot = lotById.get(row.lotId)!;
    const current = Number(row.quantity) || 0;
    const next = current + 1;
    if (next > lot.currentQuantity) {
      const capped = lot.currentQuantity;
      const cappedRows = rows.map((r, i) =>
        i === existingIdx ? { ...r, quantity: String(capped) } : r,
      );
      return { result: "at_max", product, lot, rows: cappedRows, quantity: capped };
    }
    const nextRows = rows.map((r, i) =>
      i === existingIdx ? { ...r, quantity: String(next) } : r,
    );
    return { result: "incremented", product, lot, rows: nextRows, quantity: next };
  }

  // Nueva entrada: lote FEFO en la primera fila vacía, o fila nueva.
  const fefo = lots[0]!;
  const emptyIdx = rows.findIndex((r) => !r.lotId);
  const nextRows =
    emptyIdx >= 0
      ? rows.map((r, i) =>
          i === emptyIdx ? { ...r, lotId: fefo.id, quantity: "1" } : r,
        )
      : [...rows, { lotId: fefo.id, quantity: "1" }];
  return { result: "added", product, lot: fefo, rows: nextRows, quantity: 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/features/inventory/transfer-scan.test.ts`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
cd C:/dev/dermaland
git add apps/web/src/features/inventory/transfer-scan.ts apps/web/src/features/inventory/transfer-scan.test.ts
git commit -m "feat(transferencias): logica pura applyTransferScan (barcode -> lote FEFO)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Barra de escaneo en `nueva/page.tsx`

**Files:**
- Modify: `apps/web/src/app/(app)/inventario/transferencias/nueva/page.tsx`

**Interfaces:**
- Consumes: `applyTransferScan`, `type TransferRow` desde `@/features/inventory/transfer-scan`; `listAllProducts` desde `@/features/products/product-store`; `BarcodeScanModal` desde `@/features/products/components/barcode-scan-modal`; iconos `ScanBarcode`, `Smartphone`, `CheckCircle2` desde `lucide-react`.
- Produces: cambio de UI únicamente. `createTransfer` y la validación de guardado no cambian.

- [ ] **Step 1: Reemplazar la interfaz local `Row` por el tipo compartido y agregar imports**

En `apps/web/src/app/(app)/inventario/transferencias/nueva/page.tsx`:

1. En el import de `lucide-react` (línea 6), agregar los iconos nuevos:

```tsx
import { ArrowLeft, Plus, Trash2, ArrowRightLeft, AlertTriangle, ScanBarcode, Smartphone, CheckCircle2 } from "lucide-react";
```

2. Debajo del import de `createTransfer` (línea 32), agregar:

```tsx
import { listAllProducts } from "@/features/products/product-store";
import { applyTransferScan, type TransferRow } from "@/features/inventory/transfer-scan";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
```

3. Eliminar la interfaz local `Row` (líneas 35-38):

```tsx
interface Row {
  lotId: string;
  quantity: string;
}
```

y reemplazar sus usos por `TransferRow`. En la declaración de estado (línea 53) queda:

```tsx
  const [rows, setRows] = React.useState<TransferRow[]>([{ lotId: "", quantity: "" }]);
```

En `setRow` (línea 72-73) queda:

```tsx
  const setRow = (i: number, patch: Partial<TransferRow>) =>
    setRows((r) => r.map((row, ix) => (ix === i ? { ...row, ...patch } : row)));
```

- [ ] **Step 2: Agregar estado y handler de escaneo**

Después de la línea del estado `confirm` (línea 55, `const [confirm, setConfirm] = React.useState(false);`), agregar:

```tsx
  const [scanValue, setScanValue] = React.useState("");
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<{ ok: boolean; text: string } | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement>(null);
```

Después de la definición de `setRow` (línea 73), agregar el handler:

```tsx
  const handleScan = (raw: string) => {
    const outcome = applyTransferScan({
      code: raw,
      originSelected: !!origin,
      rows,
      availableLots,
      products: listAllProducts(),
    });
    switch (outcome.result) {
      case "empty":
        break;
      case "no_origin":
        toast.error("Selecciona primero la sucursal origen.");
        break;
      case "not_found":
        setLastScan({ ok: false, text: `Código ${outcome.code} no encontrado.` });
        toast.error(`Código ${outcome.code} no encontrado.`);
        break;
      case "no_stock":
        setLastScan({
          ok: false,
          text: `${outcome.product.name} no tiene stock en la sucursal origen.`,
        });
        toast.error(`${outcome.product.name} no tiene stock en la sucursal origen.`);
        break;
      case "at_max":
        setRows(outcome.rows);
        setLastScan({
          ok: true,
          text: `${outcome.product.name} · máximo del lote (${outcome.quantity}).`,
        });
        toast.show(`Alcanzaste el stock disponible del lote (${outcome.quantity}).`, "info");
        break;
      case "added":
      case "incremented":
        setRows(outcome.rows);
        setLastScan({
          ok: true,
          text: `${outcome.product.name} · cantidad ${outcome.quantity}`,
        });
        break;
    }
  };

  const submitScanInput = () => {
    const raw = scanValue.trim();
    setScanValue("");
    handleScan(raw);
    scanInputRef.current?.focus();
  };
```

- [ ] **Step 3: Insertar la barra de escaneo antes de la tarjeta "Productos y servicios"**

Justo ANTES de `<Card className="mb-6">` que abre la sección de productos (línea 223, la que contiene "Productos y servicios"), insertar:

```tsx
      {origin && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Label>
                  <ScanBarcode className="mr-1 inline h-4 w-4" /> Escanear código de barra o escribir SKU
                </Label>
                <Input
                  ref={scanInputRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitScanInput();
                    }
                  }}
                  placeholder="Escanea con el lector o escribe y presiona Enter…"
                  className="h-12 text-base"
                />
                <p className="mt-1 text-xs opacity-60">
                  El lector funciona como teclado: cada escaneo agrega el producto
                  (lote de vencimiento más próximo) y suma +1. El lote es editable en la fila.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setCameraOpen(true)}>
                <Smartphone className="h-4 w-4" /> Escanear con cámara
              </Button>
            </div>
            {lastScan && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lastScan.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
                }`}
              >
                {lastScan.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>{lastScan.text}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Montar el modal de cámara**

Justo ANTES de `<toast.Toast />` (línea 359, cerca del final del JSX), insertar:

```tsx
      <BarcodeScanModal
        open={cameraOpen}
        continuous
        onClose={() => setCameraOpen(false)}
        onDetected={handleScan}
      />
```

- [ ] **Step 5: Verificar typecheck, lint y suite completa**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores de TypeScript, sin errores de lint nuevos en el archivo tocado, y toda la suite de Vitest en verde (incluye `transfer-scan.test.ts` de la Task 1).

- [ ] **Step 6: Verificación manual en el navegador**

Con el dev server en `http://localhost:3031`:
1. Ir a `Inventario → Transferencias → Nueva`.
2. Sin elegir origen: escribir un código en el campo de escaneo y Enter → toast "Selecciona primero la sucursal origen" (el campo aparece solo tras elegir origen; validar el mensaje si se fuerza).
3. Elegir una sucursal origen con stock. Aparece la tarjeta "Escanear producto".
4. En el campo, escribir el código de barra (o SKU) de un producto con stock en el origen y presionar Enter → se agrega una fila con el lote FEFO y cantidad 1; la línea de feedback muestra ✅ con el nombre.
5. Repetir el mismo código con Enter → la cantidad de esa fila sube a 2.
6. Escribir un código inexistente + Enter → toast rojo "Código … no encontrado".
7. Botón "Escanear con cámara" → abre el modal; (en desktop sin cámara mostrará el mensaje de cámara no disponible, lo cual es correcto).
8. Guardar transferencia → confirma y crea normalmente (flujo existente intacto).

- [ ] **Step 7: Commit**

```bash
cd C:/dev/dermaland
git add "apps/web/src/app/(app)/inventario/transferencias/nueva/page.tsx"
git commit -m "feat(transferencias): escanear codigo de barra para agregar productos

Barra de escaneo (lector USB con foco + camara via BarcodeScanModal) en
Nueva Transferencia; usa applyTransferScan (lote FEFO, +1 por escaneo).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de cierre (no son tareas)

- Tras aprobar la verificación manual, seguir la política del proyecto: bump de versión + entrada en CHANGELOG + push a Gitea/GitHub. **El deploy a producción y el merge a `main` se hacen solo con visto bueno del usuario** (push a `main` = deploy vivo).
- Actualizar la memoria del proyecto si corresponde.
