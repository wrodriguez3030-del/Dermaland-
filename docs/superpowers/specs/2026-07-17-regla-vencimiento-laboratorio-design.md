# Regla de vencimiento por laboratorio + control de vencimientos

**Fecha:** 2026-07-17
**Estado:** Diseño aprobado por el usuario ("si continúa con el diseño"); pendiente
revisión del spec escrito.
**Proyecto:** DermaLand (`C:\dev\dermaland`), Supabase `sntcvyozbhrgicwmtcoh`.

## Objetivo

Cada laboratorio define **días mínimos de vida útil** (p. ej. ISDIN 90, otro 120). El
sistema usa ese umbral para (1) **advertir al recibir** productos demasiado cerca de
vencer y (2) **mejorar el seguimiento continuo** de vencimientos. Se incluye además un
arreglo de visibilidad en "Stock actual" (reportado por el usuario: al filtrar
"Vencidos" no se ven las cantidades vencidas).

## Decisiones ya tomadas (con el usuario)

- **Comportamiento al recibir bajo mínimo:** advertir + exigir confirmación de
  admin/manager (no bloquear); el override queda registrado.
- **Alcance:** aplica al recibir **y** al seguimiento continuo (buckets "por vencer"
  por umbral del laboratorio, no un fijo de 30 días).

## Contexto verificado

- `laboratories` es editable vía repo Supabase (`laboratoryRepository`
  list/create/update/delete, `catalog.ts`) + `/api/laboratories[/id]` + diálogo
  "Editar laboratorio" en `productos/laboratorios/page.tsx`. Hoy: `id, name, country?, type?`.
- Los lotes se reciben en **dos** puntos: `features/inventory/lot-modals.tsx`
  ("Agregar stock", ya valida con `expiryError` y conoce `product.laboratoryId`) y
  `features/purchases/compras-modals.tsx` (recepción por línea con N° de lote + vencimiento).
- Motor de vencimiento: `expiryStatus(expiresAt, ref)` → `ExpiryStatus`
  (`expired|soon|warn|ok`, cortes 0/30/90) en `features/inventory/lot-store.ts`. Lo usan
  Vencimientos, Cuarentena, ficha de producto, contadores y `isLotSellable`
  (**solo `expired` bloquea venta**; `soon`/`warn` nunca bloquean).
- **Verdad del dato (hoy):** exactamente **4 productos** con lote vencido, **8 lotes /
  5,768 u.** vencidas. El filtro "Vencidos" ya los trae todos; lo que falta es mostrar la
  **cantidad vencida** (la columna Stock muestra lo *disponible*).

## Diseño

### Parte 1 — Dato: umbral por laboratorio
- Migración `0033_laboratory_shelf_life.sql`: `alter table laboratories add column
  min_shelf_life_days integer` (nullable; **NULL = sin regla** → usa el default global de
  30 días, cero cambio de comportamiento). CHECK `min_shelf_life_days is null or
  min_shelf_life_days >= 0`.
- `Laboratory.minShelfLifeDays?: number` en `types/index.ts`.
- `laboratoryRowToTs` (mapper) lee la columna; `laboratory.create/update` la escriben.
- `database.types.ts`: regenerar/añadir la columna.

### Parte 2 — Configuración (Productos → Laboratorios)
- Diálogo "Editar/Nuevo laboratorio": campo numérico **"Días mín. de vida útil al
  recibir"** (opcional; vacío = sin regla). Validación: entero ≥ 0.
- Lista de laboratorios: columna nueva "Días mín." (muestra el valor o "—").

### Parte 3 — Al recibir: advertir + confirmar + auditar
Lógica pura reutilizable `receptionShelfLifeCheck({ expiresAt, minShelfLifeDays, ref })`
→ `{ remainingDays, belowMinimum, minDays }` (+ tests). Se usa en los dos puntos:
- **`lot-modals.tsx`** y **`compras-modals.tsx`**: al capturar el vencimiento, si
  `belowMinimum` → mensaje claro ("Vence en 45 días; el mínimo de ISDIN es 90 días") y
  un checkbox/`ConfirmDialog` **"Recibir bajo mínimo (requiere admin)"**. Solo
  admin/manager puede confirmar (rol real del JWT, patrón `canSwitchBillingBranch` →
  nuevo `canReceiveBelowShelfLife(role)` = mismo set). Sin confirmación no se guarda.
- **Auditoría:** al confirmar el override, registrar en `audit_logs`
  (acción `lot.received_below_min`, con producto, lote, días restantes, umbral, usuario).
- El umbral sale del **laboratorio del producto** (`product.laboratoryId → lab.minShelfLifeDays`).
  Producto sin lab o lab sin regla → no hay advertencia.

### Parte 4 — Seguimiento continuo (por vencer por laboratorio)
- Extender el motor de forma **retrocompatible**:
  `expiryStatus(expiresAt, ref = now, soonDays = 30, warnDays = 90)`.
  - `days < 0` → `expired` (universal, sin cambios; único que bloquea venta).
  - `days < soonDays` → `soon`; `days < warnDays` → `warn`; resto `ok`.
  - **Sin argumentos extra** = comportamiento actual EXACTO (30/90). El tipo
    `ExpiryStatus` de 4 valores **no cambia** (no rompe los `Record<ExpiryStatus,...>`).
- Para un producto con lab-regla `T`: se llama `expiryStatus(date, ref, T, T)` →
  banda "warn" vacía, "soon" = `[0, T)` = "por vencer" según su laboratorio.
- Threading del umbral: `getInventoryRows`/`inventoryRowForBranch` reciben un resolutor
  `labMinDays(labId) => number | undefined` (Map liviano construido de `useLaboratoriesList()`),
  y computan `soon`/estado con el umbral del producto. Impacta: **Vencimientos**, ficha
  de producto, contadores y la alerta "Por vencer" de Stock actual. **No cambia**
  qué es vendible.

### Parte 5 — Visibilidad de cantidades bloqueadas en Stock actual (fix del reporte)
- `inventoryRowForBranch` añade `expiredUnits`, `quarantineUnits`, `recalledUnits`
  (suma de `currentQuantity` de los lotes en cada estado, respetando la sucursal).
- **Stock actual**: cuando el filtro de estado es `vencidos` / `cuarentena` / `recall`,
  la tabla muestra una columna **"Unidades vencidas/bloqueadas"** con esa cantidad, y una
  StatCard **"Unidades vencidas"** (hoy 5,768) además de "Disponibles". Así al filtrar
  "Vencidos" el usuario ve la cantidad real vencida, no solo la disponible.
- Con filtro de estado "todos"/"con-stock"/etc., la vista queda **igual que hoy**.

## Verificación / criterios de aceptación
- `receptionShelfLifeCheck` y el `expiryStatus` extendido con **tests** (bordes: exacto en
  el umbral, sin-regla = 30/90 idéntico, lab con T).
- Migración `0033` aplicada (aditiva, nullable → sin riesgo); `database.types` al día.
- Config de laboratorio guarda/lee el umbral (e2e o verificación en vivo).
- Recepción: bajo mínimo → advierte y exige confirmación admin; override auditado.
- Vencimientos/Stock actual reflejan el umbral por lab; Stock actual muestra unidades
  vencidas al filtrar "Vencidos" (cuadra con 5,768 hoy).
- `typecheck` 0, suite verde, build OK.
- Bump versión (minor, es feature) + CHANGELOG + deploy con autorización.

## Fuera de alcance (YAGNI)
- Devolución automática al proveedor / alertas por correo/WhatsApp.
- Umbral por producto individual (por ahora es por laboratorio).
- Cambiar la definición de "vencido" (sigue siendo `expires_at < hoy`, universal).

## Riesgos
- Motor `expiryStatus` es muy usado → el cambio es **aditivo con defaults** (sin
  argumentos = comportamiento actual) para no alterar pantallas que no pasen umbral.
- Threading del umbral del lab a la UI de inventario: mantener el default 30/90 cuando
  el lab no tiene regla, así ninguna pantalla cambia sin querer.
