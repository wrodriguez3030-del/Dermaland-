# Transferencias: mejoras de UX (búsqueda, lista vacía, botón en producto)

**Fecha:** 2026-07-16
**Estado:** Aprobado (diseño)
**Rama:** `feat/transferencias-ux-mejoras`

## Objetivo

Tres mejoras pedidas por el usuario sobre el flujo de Transferencias entre sucursales:

1. **Buscador de la lista** debe encontrar por **nombre, código de barra y lote** del
   producto (hoy solo matchea `productId` interno → "RADIOCARE" no encontraba nada).
2. **Lista vacía confusa:** cuando no hay transferencias, se ocultan buscador y filtros;
   solo se ve el botón **"Nueva transferencia"** y el mensaje vacío.
3. **Detalle de producto:** nuevo botón **"Transferir"** que abre Nueva Transferencia con
   ese producto ya cargado (origen = sucursal con stock, prioriza la actual; lote FEFO).

Sin migraciones ni cambios de backend.

## Componentes y flujo

### 1. Lista de Transferencias (`app/(app)/inventario/transferencias/page.tsx`)

- **Búsqueda:** nueva función pura `matchesTransferSearch(t, term, lookup)` que matchea
  `transferNumber`, `createdByName`, y por cada ítem: `lotNumber`, **nombre** y **código de
  barra** del producto (vía `lookup(productId)`). El `lookup` se arma con `getProductById`
  (catálogo local, misma fuente que los ítems de la transferencia). Placeholder ya dice
  "número, usuario, lote o producto" — se mantiene/ajusta.
- **Lista vacía:** si `all.length === 0`, NO se renderiza el `FilterBar` (buscador + filtros
  Origen/Destino + Limpiar). Se muestra solo el header con "Nueva transferencia" y una tarjeta
  de estado vacío ("Aún no hay transferencias" + botón). Cuando hay ≥1 transferencia, todo
  aparece normal.

### 2. Detalle de Producto (`app/(app)/productos/[id]/page.tsx`)

- Nuevo `QuickAction` **"Transferir"** (icono `ArrowRightLeft`) en la grilla de acciones
  rápidas, enlaza a `/inventario/transferencias/nueva?producto=<product.id>`.
- Ajustar la grilla para el nuevo botón (de 6 a 7 acciones; el layout `lg:grid-cols-6` admite
  wrap, se puede dejar o pasar a `lg:grid-cols-7`).

### 3. Nueva Transferencia (`app/(app)/inventario/transferencias/nueva/page.tsx`)

- Leer `?producto=<id>` con `useSearchParams()`. Como el componente usa search params, se
  envuelve el contenido en `<React.Suspense>` (patrón ya usado en `inventario/page.tsx`):
  renombrar el componente a `NuevaTransferenciaContent` y exportar un default que lo envuelve.
- Al montar, si viene `producto` y ya cargó la sucursal actual (`useCurrentBranch().branchId`),
  llamar a `resolveTransferPrefill` y, si hay resultado, `setOrigin(originBranchId)` +
  `setRows([{ lotId, quantity: "1" }])`. Guard con `useRef` para correr una sola vez.
- La barra de escaneo que ya existe se mantiene sin cambios.

### Lógica pura (testeable)

Nuevo `features/inventory/transfer-search.ts`:

```ts
export interface TransferSearchItem { productId: string; lotNumber: string }
export interface TransferSearchable {
  transferNumber: string;
  createdByName: string;
  items: TransferSearchItem[];
}
export interface ProductRef { name?: string; barcode?: string }
export function matchesTransferSearch(
  t: TransferSearchable,
  term: string,
  lookup: (productId: string) => ProductRef | undefined,
): boolean
```

Nuevo `features/inventory/transfer-prefill.ts`:

```ts
import type { ProductLot } from "@/types";
export interface TransferPrefill { originBranchId: string; lotId: string }
export function resolveTransferPrefill(args: {
  productId: string;
  currentBranchId?: string;
  lots: ProductLot[]; // lotes de cualquier sucursal
}): TransferPrefill | null
```

`resolveTransferPrefill`: filtra lotes `available` con `currentQuantity > 0` del producto;
si ninguno → `null`. Elige sucursal origen: la actual si tiene stock, si no la de mayor stock
total. Dentro de ella, el lote FEFO (vencimiento más próximo).

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Lista sin transferencias | Sin buscador/filtros; solo botón "Nueva transferencia" + mensaje. |
| Búsqueda por nombre/barcode/lote | Encuentra transferencias que contengan el producto. |
| `?producto` de producto sin stock en ninguna sucursal | No prellena (queda formulario normal). |
| Producto con stock solo fuera de la sucursal actual | Origen = sucursal con más stock; FEFO ahí. |
| Sucursal actual aún cargando | El efecto espera a `branchId` no vacío (re-corre al resolver). |

## Pruebas

- Unit `transfer-search.test.ts`: encuentra por número, usuario, nombre, código de barra, lote;
  no matchea lo que no corresponde; término vacío = todo.
- Unit `transfer-prefill.test.ts`: sin stock → null; prefiere sucursal actual; cae a la de mayor
  stock; elige FEFO dentro de la sucursal.
- Manual en prod tras deploy: lista vacía limpia; buscar "RADIOCARE" (con transferencias);
  botón "Transferir" desde un producto prellena origen+producto.

## Alcance / archivos

- **Nuevo:** `features/inventory/transfer-search.ts` (+ test)
- **Nuevo:** `features/inventory/transfer-prefill.ts` (+ test)
- **Editar:** `app/(app)/inventario/transferencias/page.tsx`
- **Editar:** `app/(app)/productos/[id]/page.tsx`
- **Editar:** `app/(app)/inventario/transferencias/nueva/page.tsx`

## No incluido (YAGNI)

- Autocompletar por nombre en la página de Nueva Transferencia (descartado por el usuario).
- Cambios de backend, migraciones, o al motor `createTransfer`.
