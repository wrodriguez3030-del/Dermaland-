# Changelog — DermaLand

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico (SemVer)](https://semver.org/lang/es/).

> **Regla de oro:** ningún cambio se sube a `main` sin una entrada aquí y un
> bump de versión. Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para el paso a paso.

## [Unreleased]
<!-- Agrega aquí lo que estés trabajando. Al publicar, muévelo a una versión nueva con fecha. -->

### Added
### Changed
### Fixed
### Removed
### Security

---

## [0.5.1] - 2026-06-22

### Fixed
- **POS — layout del panel "Venta actual": el resumen quedaba pegado al pie con
  un espacio blanco gigante.** Causa: el grid del POS fuerza
  `min-h-[calc(100vh-12rem)]` y los paneles se estiraban a esa altura; la lista
  de items del carrito era `flex-1`, así que se expandía para llenar todo el
  panel y empujaba Subtotal/ITBIS/Total/"Cobrar venta" al fondo (hueco enorme
  entre los productos y el resumen). Ahora el panel usa `self-start` (altura
  según contenido) y la lista usa `max-h-[55vh] overflow-y-auto` en vez de
  `flex-1`: el resumen fluye justo debajo de los productos y baja naturalmente
  al agregar más; con muchos productos solo la lista hace scroll y el botón
  "Cobrar venta" queda accesible. Carrito vacío se ve limpio (sin resumen al
  fondo).

---

## [0.5.0] - 2026-06-22

### Fixed
- **POS: el click en una tarjeta con stock no agregaba al carrito (bug crítico
  en producción).** Causa raíz: `addProduct` buscaba el producto con
  `getProductById` del **catálogo mock**; en producción (Supabase) el id real no
  existe en el mock → la función retornaba `undefined` y abortaba **en silencio**
  (sin agregar nada ni mostrar error), aunque el badge mostrara "X unid. aquí"
  (el badge usa los lotes reales). Ahora `addProduct` resuelve el producto desde
  la lista reactiva `useProducts()` (real en Supabase) y **nunca falla en
  silencio**: muestra toast de éxito ("Producto agregado al carrito.") o un error
  claro ("No se pudo agregar: no hay lote vendible / el lote está vencido / en
  cuarentena / cantidad no disponible / sin stock en {sucursal}…").

### Added
- **Botón "Agregar" visible en cada tarjeta del POS** (además del click en la
  tarjeta; ambos hacen lo mismo). Si hay stock aquí → "Agregar"; si hay en otra
  sucursal → "Ver stock"; si no hay en ninguna → desactivado con la razón. Cursor
  pointer y hover claros.
- Componente reutilizable y testeable `ProductCard` (`features/pos/`), extraído
  del grid del POS.

### Notes
- El motor de stock (`sellableStockForBranch`, `nextFefoLotForBranch`,
  `fefoLotsForBranch`, `stockByBranchForProduct`, `lotBlockReason`) ya era ÚNICO y
  consistente (mismo predicado `isLotSellable`): badge y selección FEFO coinciden.
  El cobro descuenta stock por FEFO y registra el movimiento de inventario vía
  `PATCH /api/lots/:id`. No se mostró ningún UUID/almacén.

---

## [0.4.0] - 2026-06-22

### Added
- **POS: acciones cuando un producto no tiene stock en la sucursal actual.** El
  modal "Stock por sucursal" ahora ofrece tres botones para que el cajero no
  quede perdido:
  - **Cambiar a {sucursal} ({n} unid.)** — cambia la sucursal seleccionada (la
    misma que usan Productos y el selector superior, vía `useCurrentBranch`) a
    una que sí tiene stock, con toast de confirmación.
  - **Agregar stock aquí — {sucursal actual}** — abre el alta de lote
    preseleccionada a la sucursal actual (p. ej. Dermaland Cutis); guarda en ese
    `branch_id` exacto y, si la sucursal no tenía almacén interno, se crea solo
    (`ensureDefaultWarehouseForBranch`).
  - **Transferir stock** — lleva al flujo de transferencias.

### Fixed
- POS ya no puede mostrar el UUID de la sucursal actual como nombre (fallback
  `?? branchId` reemplazado por `getBranchDisplayName(..., "Sucursal
  seleccionada")`); el modal de stock por sucursal usa nombres legibles.

### Notes
- Diagnóstico (Supabase real): las únicas sucursales reales activas del negocio
  son **Dermaland Cutis** y **DermaLand Principal** (ambas con almacén interno).
  No existen Naco/Piantini/Santiago como sucursales reales (eran mock). El lote
  de A-derma (30 unid., `INIT-DERM-I00059`) está legítimamente en DermaLand
  Principal: no hubo corrupción, solo el POS estaba en otra sucursal.

---

## [0.3.1] - 2026-06-22

### Fixed
- **No se muestran IDs técnicos (UUID) al usuario.** En Inventario > Stock
  actual el banner "Filtrado por sucursal" mostraba el `branch_id` crudo
  (`00000000-…-b001`) cuando el nombre no se resolvía. Causa: `resolveBranchName`
  leía solo el store síncrono (vacío en modo Supabase, donde las sucursales se
  cargan por hook) y caía al UUID. Ahora resuelve desde la lista reactiva y,
  si no encuentra, muestra "Sucursal seleccionada" — nunca el UUID.
- Mismo patrón corregido en Vencimientos, Cuarentena, Transferencias, y en
  Compras (pagos recurrentes / facturas de proveedores): los fallbacks
  `?? branchId` / `?? productId` ya no filtran UUIDs (muestran el nombre o
  "Sucursal no encontrada" / "Producto no encontrado").

### Added
- Helper `getBranchDisplayName(branchId, fallback?)` en `branch-store` — devuelve
  SIEMPRE un nombre legible, nunca el UUID. `resolveBranchName` ahora es un alias.
- Cache en memoria `cacheBranchNames` (se llena en cada fetch de
  `useBranchesState`) para que los resolvers síncronos muestren el nombre real
  también en modo Supabase, sin persistir en localStorage.

---

## [0.3.0] - 2026-06-21

### Added
- **Buscador + creación rápida en la sección "Clasificación" del formulario de
  producto.** Marca, Categoría y Laboratorio ahora son selects con buscador
  (insensible a acentos/mayúsculas) y un botón "+" teal (tooltip + aria-label)
  que abre un modal para crear el registro sin salir del formulario. Al crear:
  se guarda en Supabase, se refresca la lista y queda **seleccionado
  automáticamente** en el producto, con toast de éxito.
- Componente reutilizable `CreatableClassificationSelect`
  (`features/products/components/`). Modal por entidad: Marca = Nombre;
  Categoría = Nombre + Descripción; Laboratorio = Nombre + País (los campos
  coinciden con las columnas reales de cada tabla). Aplica a Crear y Editar
  producto (ambos usan el mismo `ProductForm`).

### Changed
- La sección Clasificación deja de usar `<select>` nativos por los nuevos
  combobox creables. Validación de nombre obligatorio y anti-duplicado por
  nombre (client-side, además del `unique(business_id, name)` del servidor).

---

## [0.2.0] - 2026-06-20

### Added
- **Ubicación interna automática por sucursal.** El inventario es por sucursal;
  el sistema crea su almacén/ubicación interna por defecto de forma automática e
  idempotente (`ensureDefaultWarehouseForBranch`). El usuario nunca configura
  almacenes ni ve "almacén"/"warehouse".
- Script seguro `scripts/ensure-branch-warehouses.mjs` (dry-run + real) para
  reparar sucursales existentes sin esa ubicación. No borra ni duplica nada.

### Fixed
- Agregar stock en una sucursal sin almacén configurado (p. ej. "Dermaland
  Cutis") ya no falla con "la sucursal seleccionada no tiene un almacén
  configurado": la ubicación interna se crea automáticamente al vuelo en
  `productLot.create` y al crear/editar la sucursal.

### Changed
- `resolveBranchWarehouseId` deja de lanzar cuando falta el almacén y delega en
  `ensureDefaultWarehouseForBranch`. Mensaje de fallback del POST `/api/lots`:
  "No se pudo preparar la sucursal para recibir inventario. Intenta nuevamente."

---

## [0.1.0] - 2026-06-09

### Added
- Sistema de versionado y documentación para colaboradores:
  `CHANGELOG.md` (este archivo) + `CONTRIBUTING.md` con el flujo de trabajo.
- Mirror completo del repositorio a la Gitea de Cibao Cloud:
  `http://infra:3000/ARB/dermaland` (org **ARB**, repo privado).
  Incluye las ramas `main`, `feature/dgii-module-review-adjustments`
  y `feature/dgii-electronic-invoicing`.

### Changed
- Versión raíz del monorepo `0.0.0 → 0.1.0` como línea base del versionado.

### Notas
- A partir de aquí, cada cambio incrementa la versión según SemVer y deja su
  entrada en este archivo. El trabajo de facturación electrónica DGII vive en
  ramas `feature/dgii-*`; respetar la política de no avanzar a Fase G/producción
  fiscal sin autorización explícita.

<!--
Plantilla de comparación de versiones (ajusta cuando tengas tags):
[Unreleased]: http://infra:3000/ARB/dermaland/compare/v0.1.0...HEAD
[0.1.0]: http://infra:3000/ARB/dermaland/releases/tag/v0.1.0
-->
