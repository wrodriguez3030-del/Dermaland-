# Migración del módulo de Inventario físico (conteo físico) a Supabase

> Diseño / plan. Estado al 2026-07-11 (v0.59.0). Autor: sesión de mejoras.
> Léelo junto a `docs/auditoria-supabase.md` (patrón de migración por módulo).

## 1. Estado actual

El módulo de **inventario físico** (crear conteo, escanear, ver detalle,
Reportes › Conteos) es la única parte grande que **todavía lee de datos de
ejemplo (mock)**, no de Supabase:

- Páginas que leen mock:
  - `app/(app)/conteo-fisico/page.tsx` (lista) → `mockInventoryCounts`.
  - `app/(app)/conteo-fisico/[id]/page.tsx` (detalle, Server Component) →
    `getInventoryCountById/getItemsForCount/getScansForCount` +
    `getProductById/getBrandById/…` (todos mock).
  - `app/(app)/conteo-fisico/[id]/escanear/page.tsx` (escaneo).
  - `app/(app)/reportes/conteos/page.tsx` (reporte) → `mockInventoryCounts` /
    `mockCountItems` + resolvers mock (ver `counts-report-excel.ts`).
- Lógica de reporte pura y COMPLETA (no cambia con la migración):
  `features/inventory/physical-count-report.ts`, `counts-report-excel.ts`,
  `counts-report-pdf.ts`, `physical-count-export.ts`.

### Lo que YA existe en Supabase (esquema, sin migración de datos)

Verificado por MCP (proyecto `sntcvyozbhrgicwmtcoh`):

| Tabla | Filas hoy | Uso |
|---|---:|---|
| `inventory_counts` | 0 | cabecera del conteo |
| `inventory_count_items` | 0 | ítem esperado/contado por producto·lote |
| `inventory_count_scans` | 0 | cada escaneo (idempotente por `device_id`+`offline_scan_id`) |
| `inventory_count_evidence` | 0 | fotos/evidencia |
| `inventory_count_sync_logs` | 0 | bitácora de sync offline |
| `inventory_movements` | 35 | movimientos (ajustes por conteo) |
| `product_lots` / `inventory_stock_by_lot` | (con datos) | stock real por lote |

Además ya hay:
- `server/repositories/supabase/inventory.ts` (repo con parte de la lógica de
  scans usada por la ruta de sync).
- `app/api/inventory-counts/sync/route.ts` (inserta scans en Supabase,
  idempotente).
- Infra offline: `features/inventory-counts/offline/db.ts`, `sync/sync.ts`,
  `scan-session-store.ts`, `use-barcode-scanner.ts`.

**Conclusión:** la migración es sobre todo **cablear lectura/escritura** de las
páginas a Supabase; el esquema y la parte de scans ya están. Como las tablas
están vacías, no hay backfill.

## 2. Objetivo

Que crear conteo, escanear, aprobar/ajustar, ver detalle y Reportes › Conteos
operen sobre **datos reales de Supabase por `business_id`/sucursal**, con el
mismo patrón que Productos/Sucursales (repos factory + API routes + stores con
fallback, gated por `DATA_SOURCE`). Producción mock intacta hasta el cutover.

## 3. Alcance por fases

### Fase 1 — Repositorio de lectura + API (sin tocar UI)
- Extender `repositories/types.ts` con el contrato `InventoryCountsRepo`:
  `listCounts(branchId?)`, `getCount(id)`, `getItems(countId)`,
  `getScans(countId)`, `getEvidence(countId)`, `getMovementsForCount(countId)`.
- Implementar `repositories/supabase/inventory-counts.ts` (SELECT con RLS por
  `business_id`) + mappers snake→camel en `mappers.ts`. Mantener
  `repositories/mock/*` como fallback.
- Registrar en la factory (`repositories/index.ts`) gated por `DATA_SOURCE`.
- API routes REST: `app/api/inventory-counts/route.ts` (GET lista),
  `app/api/inventory-counts/[id]/route.ts` (GET detalle+items+scans). 409 si no
  supabase (como el resto).

### Fase 2 — Stores de cliente + páginas de lectura
- `features/inventory-counts/counts-store.ts`: hooks `useCounts()`,
  `useCount(id)` que hacen fetch a las API con **fallback a mock** (patrón de
  `product-store`/`branch-store`).
- Reemplazar en las 4 páginas los `mock*`/`get*ById` por los hooks. El
  **detalle** (hoy Server Component) pasa a Client Component o a un route
  handler que arme el `PhysicalCountReport` con lookups de Supabase
  (`useProducts`, catálogos, `useBranches`) en vez de mock.
- Reportes › Conteos: cambiar `countLookups` (hoy mock en la página) por los
  resolvers de Supabase (productos/catálogos/sucursales reales). Como los
  ítems pasarán a ser reales, los `productId` resolverán contra `useProducts`.

### Fase 3 — Escritura (crear/escaneo/aprobación/ajuste)
- `createCount`, `addItem`, `submit`, `approve`/`reject`, `applyAdjustments`
  (genera `inventory_movements` `count_adjustment` y actualiza
  `inventory_stock_by_lot`). El escaneo ya inserta scans; conectar el alta del
  conteo y el cierre.
- Guardas: sesión de caja/negocio activo, `business_id` efectivo (patrón
  `effectiveBusinessId` de otros módulos), verificación de filas afectadas en
  writes (lección de csl-app: UPDATE de 0 filas ≠ éxito).

### Fase 4 — Verificación y cutover
- e2e: crear conteo → escanear → aprobar → ajuste → export Excel/PDF con datos
  reales. Verificar que el reporte enriquecido (v0.59.0) muestre sucursal/lab/
  marca/lote/vencimiento reales.
- Quitar dependencia de `mock-data/inventory-counts` en las páginas.
- Actualizar `docs/auditoria-supabase.md` y `docs/estado-actual.md`.

## 4. Riesgos / notas
- **RLS**: confirmar policies por `business_id` en las 5 tablas de conteo (mismo
  patrón que el resto; ver `docs/rls-policy.md`).
- **Fechas/zona horaria**: mantener formateo string-based del reporte (ya es
  determinista).
- **DGII/inventario**: los ajustes por conteo tocan stock real → probar en
  preview antes de prod; NO afecta secuencias fiscales.
- **Sin backfill**: las tablas están vacías; los conteos mock son solo demo y no
  se migran.

## 5. Entregable de esta sesión (v0.59.0)
Ya hecho, independiente de la migración: el Excel y el PDF de Reportes › Conteos
ahora **traen Sucursal, Laboratorio, Marca, Categoría, Código de barra y
Vencimiento** (con datos mock hasta el cutover). Ver CHANGELOG 0.59.0.
