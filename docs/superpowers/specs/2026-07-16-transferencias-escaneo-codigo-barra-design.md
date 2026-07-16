# Escanear código de barra en Nueva Transferencia

**Fecha:** 2026-07-16
**Estado:** Aprobado (diseño)
**Rama:** `feat/transferencias-escaneo-barcode`

## Objetivo

En `Inventario → Transferencias → Nueva` (`app/(app)/inventario/transferencias/nueva/page.tsx`),
permitir agregar productos a la transferencia **escaneando su código de barra** (lector
USB o cámara del celular), en vez de buscarlos manualmente en el dropdown
"Selecciona producto / lote".

La funcionalidad **reutiliza la infraestructura de escaneo ya existente y probada** del
módulo de Inventario físico. No inventa mecanismo de escaneo nuevo.

## Contexto e infraestructura reutilizada

- `features/inventory-counts/use-barcode-scanner.ts` — hook `useBarcodeScanner`
  (cámara con BarcodeDetector nativo + fallback `@zxing/browser`; debounce anti-doble-escaneo
  de 500 ms).
- `features/products/components/barcode-scan-modal.tsx` — `BarcodeScanModal`, escaneo con
  cámara del celular (soporta modo `continuous`).
- `features/inventory-counts/scan-session-store.ts` — `findProductByCode(products, code)`:
  matchea primero por `barcode` exacto, luego por `SKU` (case-insensitive). Se reutiliza tal cual.
- `features/inventory/lot-store.ts` — `listAllLots()` (ya usado por la página) y
  `useInventoryTick()` para reactividad.
- `features/products/product-store.ts` — `useProducts()` para obtener la lista de productos
  con `barcode`/`sku` y construir el índice de búsqueda.

La página maneja **lotes** (`lotId`), no productos. Un código de barra identifica un
*producto*, que puede tener varios lotes en la sucursal origen. La resolución producto → lote
es la parte nueva de lógica.

## Decisiones de diseño (confirmadas con el usuario)

1. **Dispositivo:** soportar **ambos** — lector físico/USB (campo con foco) y cámara del celular.
2. **Resolución de lote:** auto-seleccionar el lote **FEFO** (vencimiento más próximo) con stock
   disponible en el origen. El dropdown de lote de cada fila sigue editable para override manual.
3. **Cantidad:** cada escaneo del mismo producto suma **+1**; el campo de cantidad sigue editable
   (permite escanear unidad por unidad o escanear una vez y escribir el total).

## Componentes y flujo

### 1. UI — barra de escaneo

Nueva tarjeta **"Escanear producto"** encima de la tabla "Productos y servicios", visible
**solo cuando hay sucursal origen seleccionada** (el escaneo busca stock en ese origen).
Contiene:

- **Campo de texto con foco automático** — el lector USB "escribe" el código aquí; `Enter`
  procesa el código, limpia el campo y vuelve a tomar foco. Mismo patrón que la página
  `conteo-fisico/[id]/escanear`.
- **Botón "Escanear con cámara"** — abre `BarcodeScanModal` en modo `continuous`.
- **Línea de feedback del último escaneo** — ✅ `AGREGADO: <Producto> · cantidad N` o
  ❌ `Código <code> no encontrado` / `<Producto> sin stock en el origen`.

La tabla de filas y el botón "Agregar producto" manual **no cambian**. El escaneo es aditivo.

### 2. Lógica de matcheo — función pura `applyTransferScan`

Nuevo archivo `features/inventory/transfer-scan.ts`. Función pura, sin efectos, testeable:

```ts
interface Row { lotId: string; quantity: string }

type TransferScanOutcome =
  | { result: "no_origin" }
  | { result: "not_found"; code: string }
  | { result: "no_stock"; product: Product }
  | { result: "at_max"; product: Product; lot: ProductLot; rows: Row[]; quantity: number }
  | { result: "added" | "incremented"; product: Product; lot: ProductLot; rows: Row[]; quantity: number };

function applyTransferScan(args: {
  code: string;
  originSelected: boolean;
  rows: Row[];
  availableLots: ProductLot[]; // lotes available del origen, currentQuantity > 0
  products: Product[];
}): TransferScanOutcome
```

Algoritmo:

1. Si `originSelected` es false → `no_origin`.
2. `code` vacío tras trim → se ignora (no outcome / no-op).
3. `product = findProductByCode(products, code)`. Si no existe → `not_found`.
4. Lotes del producto en `availableLots`, ordenados FEFO (`expiresAt` asc). Si vacío → `no_stock`.
5. Si existe una fila cuyo `lotId` pertenece a un lote de ese producto:
   - `next = (Number(quantity) || 0) + 1`.
   - Si `next > lot.currentQuantity` → topar en `lot.currentQuantity` y devolver `at_max`.
   - Si no → actualizar esa fila, devolver `incremented`.
6. Si no hay fila para el producto:
   - Tomar el lote FEFO (`lots[0]`).
   - Colocarlo en la **primera fila vacía** (`!lotId`); si no hay, **agregar** una fila nueva.
   - Cantidad = `"1"`. Devolver `added`.

La función devuelve el nuevo arreglo `rows` (inmutable) y metadatos para el feedback/toast.
La página aplica `setRows(outcome.rows)` y muestra el toast según `result`.

### 3. Wiring en la página

- Agregar `useProducts()` para el índice de productos (no cambia la lógica de lotes existente).
- `handleScan(raw: string)`: llama `applyTransferScan`, aplica `setRows`, dispara toast + feedback.
- Campo de texto: `onKeyDown` Enter → `handleScan(code)` + limpiar + refocus.
- Botón cámara: estado `cameraOpen`; `BarcodeScanModal` `continuous` con `onDetected={handleScan}`.
- Estado `lastScan` para la línea de feedback.

`createTransfer` y la validación de guardado **no se tocan**. La validación existente de
"la cantidad supera el stock disponible" sigue siendo la red de seguridad al guardar.

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Escanear sin origen | Toast "Selecciona primero la sucursal origen". |
| Código no encontrado | Toast rojo "Código `<code>` no encontrado". |
| Producto sin lotes disponibles en origen | Toast "`<Producto>` no tiene stock en la sucursal origen". |
| Incremento supera stock del lote | Se topa en el máximo del lote + toast de aviso. |
| Doble escaneo accidental | Debounce 500 ms del hook (cámara). Enter manual del lector no duplica. |
| Producto con varios lotes | Se usa FEFO; el usuario puede cambiar el lote en el dropdown de la fila. |

## Pruebas

**Unit (`features/inventory/transfer-scan.test.ts`):**
- Sin origen → `no_origin`.
- Código inexistente → `not_found`.
- Producto sin stock en origen → `no_stock`.
- Producto con stock, fila vacía → `added`, lote FEFO, cantidad 1.
- Escaneo repetido → `incremented`, cantidad 2.
- Incremento en el tope del lote → `at_max`, cantidad topada.
- Producto con varios lotes → elige el de vencimiento más próximo.
- Match por SKU además de por barcode.

**Manual:** en `localhost:3031`, seleccionar origen, escanear por entrada de texto (simular
lector) y verificar filas/cantidades; abrir modal de cámara y confirmar que agrega.

## Alcance / archivos

- **Nuevo:** `features/inventory/transfer-scan.ts`
- **Nuevo:** `features/inventory/transfer-scan.test.ts`
- **Editar:** `app/(app)/inventario/transferencias/nueva/page.tsx` (barra de escaneo + wiring)

Sin migraciones, sin cambios de backend, sin tocar `createTransfer`.

## No incluido (YAGNI)

- No se agrega escaneo a la edición de transferencias existentes ni a otros módulos.
- No se cambia el modelo de datos ni la persistencia.
- No se agrega selección de lote por UI de "elige entre varios lotes" al escanear
  (se usa FEFO + dropdown editable; suficiente).
