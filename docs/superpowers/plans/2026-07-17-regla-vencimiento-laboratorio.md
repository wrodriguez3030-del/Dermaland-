# Regla de vencimiento por laboratorio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Cada laboratorio define días mínimos de vida útil; el sistema advierte al recibir bajo ese mínimo, usa el umbral para el seguimiento continuo de vencimientos, y hace visibles las cantidades vencidas/bloqueadas en Stock actual.

**Architecture:** Columna nullable en `laboratories`; lógica pura testeable (`receptionShelfLifeCheck`, `expiryStatus` extendido); threading del umbral del lab hacia el motor de inventario y las pantallas; advertencia + confirmación admin con auditoría en los dos puntos de recepción.

**Tech Stack:** Next.js (App Router), Supabase (Postgres/RLS), TypeScript, Vitest.

## Global Constraints
- Sin regla (`min_shelf_life_days` NULL) = comportamiento actual EXACTO (30/90). Cambios aditivos.
- `expiryStatus` sin args extra = idéntico a hoy. Tipo `ExpiryStatus` (4 valores) intacto.
- Solo `expired` bloquea venta; `soon`/`warn` nunca bloquean.
- TDD en la lógica pura. typecheck 0 y suite verde antes de deploy. Deploy solo con autorización.

---

### Task 1: Dato — umbral por laboratorio
**Files:** mig `supabase/migrations/0033_laboratory_shelf_life.sql`; `apps/web/src/server/db/database.types.ts`; `apps/web/src/types/index.ts`; `apps/web/src/server/repositories/supabase/mappers.ts` (`laboratoryRowToTs` + `laboratoryToRow` si existe); `catalog.ts` (create/update).
**Interfaces — Produces:** `Laboratory.minShelfLifeDays?: number`.
- [ ] Migración: `alter table laboratories add column min_shelf_life_days integer check (min_shelf_life_days is null or min_shelf_life_days >= 0);` aplicar por MCP `apply_migration`.
- [ ] `database.types.ts`: agregar `min_shelf_life_days: number | null` en Row/Insert/Update de `laboratories`.
- [ ] `Laboratory` type: `minShelfLifeDays?: number`.
- [ ] Mapper: leer/escribir `min_shelf_life_days ↔ minShelfLifeDays`; create/update incluyen el campo.
- [ ] typecheck 0. Commit.

### Task 2: Configuración (Productos → Laboratorios)
**Files:** `apps/web/src/app/(app)/productos/laboratorios/page.tsx` (diálogo + lista); posible form component.
- [ ] Campo numérico "Días mín. de vida útil al recibir" en el diálogo Nuevo/Editar (opcional, entero ≥ 0).
- [ ] Columna "Días mín." en la tabla (valor o "—").
- [ ] Guardar/leer vía repo existente. typecheck 0. Commit.

### Task 3: Lógica pura de recepción + permiso
**Files:** create `apps/web/src/features/inventory/reception-shelf-life.ts` (+ `.test.ts`); `apps/web/src/features/tenancy/permissions.ts` (+ test).
**Produces:** `receptionShelfLifeCheck({expiresAt, minShelfLifeDays, ref?}) => {remainingDays, minDays, belowMinimum}`; `canReceiveBelowShelfLife(role) => boolean`.
- [ ] Test: vence en 45, min 90 → belowMinimum true, remainingDays 45. Sin min (undefined/null) → belowMinimum false. Exacto en el umbral (remaining==min) → false. expiresAt vacío → belowMinimum false.
- [ ] Implementar (usar `expiryStatus`/días como en `expiryStatus`). GREEN.
- [ ] `canReceiveBelowShelfLife`: super_admin/admin/manager true; resto false (mismo set que `canManageBranches`) + test.
- [ ] Commit.

### Task 4: Recepción — advertir + confirmar + auditar
**Files:** `apps/web/src/features/inventory/lot-modals.tsx`; `apps/web/src/features/purchases/compras-modals.tsx`; audit vía repo `audit_logs` existente; pasar `canReceiveBelowShelfLife` (rol real) por prop desde el server component contenedor (o hook de sesión cliente si existe).
- [ ] En Agregar stock: al set expiresAt, resolver umbral del lab del producto; si `belowMinimum` → banner + checkbox "Recibir bajo mínimo (admin)"; bloquear submit sin confirmación; solo admin/manager ve/activa el check.
- [ ] En Compras (por línea): misma verificación; impedir recepción sin confirmación.
- [ ] Al confirmar override: registrar en `audit_logs` (acción `lot.received_below_min`, producto/lote/díasRestantes/umbral/usuario).
- [ ] typecheck 0. Commit.

### Task 5: `expiryStatus` lab-aware (pura)
**Files:** `apps/web/src/features/inventory/lot-store.ts` (`expiryStatus`) + `lot-store` tests o nuevo `expiry-status.test.ts`.
**Produces:** `expiryStatus(expiresAt, ref?, soonDays=30, warnDays=90): ExpiryStatus`.
- [ ] Test: sin args extra = 30/90 idéntico (vence en 20→soon, 60→warn, 120→ok, -1→expired). Con soonDays=90,warnDays=90: vence en 60→soon, 100→ok. Bordes exactos.
- [ ] Implementar params con defaults. GREEN. typecheck 0. Commit.

### Task 6: Threading del umbral al motor de inventario
**Files:** `apps/web/src/features/inventory/lot-store.ts` (`inventoryRowForBranch`), `inventory-stock-engine.ts` (`getInventoryRows`) + tests.
**Produces:** `getInventoryRows(lots, products, branchId, labMinDays?)` donde `labMinDays: (labId?)=>number|undefined`; `InventoryRow` gana `expiredUnits`, `quarantineUnits`, `recalledUnits`.
- [ ] Test: producto con lab-regla 90 y lote a 60 días → `soon>0`. `expiredUnits` suma cantidades de lotes vencidos de la sucursal. Sin `labMinDays` → comportamiento actual.
- [ ] Implementar (resolver umbral por `product.laboratoryId`; default 30/90). GREEN. typecheck 0. Commit.

### Task 7: Stock actual — visibilidad de bloqueados + umbral por lab
**Files:** `apps/web/src/app/(app)/inventario/page.tsx`; construir `labMinDays` de `useLaboratoriesList()`.
- [ ] Pasar `labMinDays` a `getInventoryRows`.
- [ ] Cuando `status ∈ {vencidos,cuarentena,recall}`: columna "Unidades bloqueadas" (usa expired/quarantine/recalledUnits) + StatCard "Unidades vencidas/bloqueadas" (cuadra 5,768 con Vencidos hoy). Otros estados: igual que hoy.
- [ ] typecheck 0. Commit.

### Task 8: Vencimientos + ficha de producto lab-aware
**Files:** `apps/web/src/app/(app)/inventario/vencimientos/page.tsx`; `apps/web/src/app/(app)/productos/[id]/page.tsx`.
- [ ] Pasar el umbral del lab del producto a `expiryStatus` en esas vistas (default si no hay regla).
- [ ] typecheck 0. Commit.

### Task 9: Cierre
- [ ] Suite completa verde + build OK.
- [ ] Bump minor + CHANGELOG. Commit. Deploy con autorización.

## Self-review
- Cobertura: cada parte del spec (1–5) mapea a Tasks 1–8; cierre en 9. ✓
- Sin placeholders de código en la lógica pura (Tasks 3/5/6 llevan tests concretos). ✓
- Consistencia de tipos: `minShelfLifeDays`, `receptionShelfLifeCheck`, `expiryStatus(…,soonDays,warnDays)`, `getInventoryRows(…,labMinDays)`, `expiredUnits/quarantineUnits/recalledUnits` usados consistentes. ✓
