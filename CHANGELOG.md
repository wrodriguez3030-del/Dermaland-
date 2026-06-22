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
