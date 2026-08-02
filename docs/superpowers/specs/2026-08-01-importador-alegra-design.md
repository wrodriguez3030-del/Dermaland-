# Importador de Alegra (catálogo + inventario) — Diseño

**Fecha:** 2026-08-01
**Estado:** ▶️ **REACTIVADO el 2026-08-02** con alcance reducido — ver
"Alcance vigente" abajo. Reemplaza al estado PAUSADO del 2026-08-01.

### Alcance vigente (2026-08-02)

El usuario pidió: *"crear un importador suc principal cuando le suba este archivo
actualice en inventario de la sucursal principal, y la diferencia entre cantidad
en principal con la cantidad total ponerla en la sucursal cutis"*.

Se implementa **solo el importador de INVENTARIO**, con **un único archivo** (el
export completo de 13 columnas, tipo `Cantidad de productos - Dermaland
principal.xlsx`):

- **DermaLand Principal** ← columna **E** `Cantidad en Principal`
- **Dermaland Cutis** ← columna **H** `Cantidad total` **−** columna **E**

Queda **fuera** de esta entrega (el diseño sigue documentado abajo para
retomarlo): el archivo de catálogo (precio/costo/código de barras), la creación
de productos nuevos y la pestaña de resolución de casi-duplicados. Lo que no
empareja se **reporta y se omite**.

**Decisión del usuario sobre los lotes de Cutis (2026-08-02):** hacen falta 464
lotes nuevos y `product_lots.expires_at` es NOT NULL, pero el archivo no trae
vencimientos → **el lote nuevo en Cutis hereda el `expires_at` del lote que ese
producto ya tiene en Principal**. Si el producto no tiene lote en Principal, se
reporta y se omite (no se inventa fecha).

Historial: diseño aprobado ("ok") → Cutis confirmado ("el otro almacen es cutis")
→ pausado ("quiero pausar menu de importacion") → carga directa por script
(`scripts/import-stock-principal-from-alegra.mjs`, aplicada el 2026-08-01:
Principal 40 889 → 2 312 u.) → reactivado con este alcance.
**Proyecto:** DermaLand (`~/Projects/dermaland`), Supabase `sntcvyozbhrgicwmtcoh`,
negocio `00000000-0000-0000-0000-00000000d001` (DermaLand SRL).

## Objetivo

Que el **usuario** pueda subir por sí mismo, desde la app y sin ayuda técnica, los
dos export de Alegra para actualizar el catálogo (precio, costo, ITBIS, código de
barras) y el inventario (cantidades por sucursal), **sin duplicar productos**.

Hoy esto solo se puede hacer corriendo un script de Node a mano
(`scripts/import-barcodes-from-alegra.mjs`, que además solo importa códigos de
barra). El objetivo es convertir esa capacidad en una pantalla del producto.

## Problema que resuelve (verdad del dato, medida 2026-08-01)

- **1 339 de 1 355 productos tienen `price = 0` y `cost = 0`.** Solo 16 tienen
  precio real. El POS bloquea vender productos con precio 0 (v0.96.4), así que
  hoy casi todo el catálogo es **invendible**.
- **El stock está inflado 15×.** La BD reporta 40 889 unidades (lotes
  `INIT-DERM-*` sembrados, 30 u. c/u, costo 0); la realidad de Alegra son
  **2 656** en Principal. Cutis tiene 5 578 unidades de lotes de prueba
  (`WWWWWWW` 3 433, `asdfasd` 1 000, `DSFSDF` 995) contra **1 436** reales.
- El proceso actual (script + credenciales + service_role key) no es repetible
  por el dueño del negocio.

## Decisiones tomadas con el usuario

1. **El stock se aplica como ajuste por diferencia** contra `inventory_movements`
   (no se borran lotes, no se recrea el stock de cero).
2. **El "otro almacén" de Alegra es Dermaland Cutis.** Se deriva como
   `Cantidad total − Cantidad en Principal` y se aplica a esa sucursal.
3. **No se importan vencimientos** en esta versión (data sucia: 389 de 702 ya
   vencidos, uno con fecha 1905).
4. **Los casos dudosos los resuelve una persona**, no un algoritmo.

## Contexto verificado en el código y la base

- `products`: `sku, barcode, name, description, unit, cost, price, itbis_rate,
  min_stock, max_stock, active, sellable, deleted_at, business_id`.
- **`products.price` es ITBIS-INCLUIDO** y `products.cost` es sin ITBIS
  (`features/pos/cart-line.ts`: *"Los precios de DermaLand son ITBIS-INCLUIDOS"*;
  `features/products/pricing.ts`: `precio = cost × (1+itbis) × (1+margen)`).
- `product_lots`: el stock vive por `branch_id` + `warehouse_id`, con
  `lot_number`, `expires_at`, `unit_cost`, `current_quantity`.
- **`inventory_movements` ya existe y está en uso** (20 `adjustment_negative`,
  15 `entry_purchase`, 7 `exit_sale`, 2+2 `transfer_*`, 1 `adjustment_positive`).
  `MovementType` incluye `adjustment_positive`, `adjustment_negative` y
  `count_adjustment` (`types/index.ts:256`).
- Roles con permiso de gestión: `super_admin | admin | manager`
  (`features/tenancy/permissions.ts` — mismo grupo que gestiona sucursales y
  recibe lotes bajo mínimo de vida útil).
- La app **ya sabe generar** Excel (`lib/reports/excel`, ExcelJS) y **ya sabe
  subir archivos** (`product-image-uploader.tsx`, `dgii/certificate-actions.ts`),
  pero **no tiene ningún importador de Excel**.
- Sucursales: `b001` DermaLand Principal, `0a1fd664…` Dermaland Cutis.
- Gotcha vigente: PostgREST corta en 1 000 filas sin `.range()` — la lectura de
  productos **debe paginar** (`fetchAllPages`).

## Los dos archivos

### A. `Alegra - Productos-servicios - DermaLand -.xlsx` (catálogo)

25 columnas, 1 443 filas. Se usan: `Nombre` (col 5), `Unidad de medida` (8),
`Descripción` (10), `Costo inicial` (11), `Precio base` (12), `Impuesto` (13),
`Precio total` (16), `Código de barras` (25). El resto se ignora (cuentas
contables, referencia y categoría vienen vacías).

Mapeo verificado: **`Precio total = Precio base × (1 + ITBIS)` cuadra en
1 443/1 443 filas**, lo que corresponde 1:1 con la convención de DermaLand.

| Columna Alegra | Campo DermaLand |
|---|---|
| `Precio total` | `products.price` (ITBIS incluido) |
| `Costo inicial` | `products.cost` (sin ITBIS) |
| `Impuesto` | `products.itbis_rate` (18 o 0) |
| `Código de barras` | `products.barcode` (UPC-12 → EAN-13 con `0` delante) |
| `Descripción` | `products.description` (solo si está vacía en BD) |
| `Unidad de medida` | `products.unit` |

### B. `Alegra - Valor de inventario - DermaLand -.xlsx` (inventario)

13 columnas, 1 370 filas. Se usan: `Producto/servicio` (col 2),
`Cantidad en Principal` (5), `Cantidad mínima en Principal` (6),
`Cantidad máxima en Principal` (7), `Cantidad total` (8), `Costo promedio` (12).
**No trae código de barras** → empareja solo por nombre.

| Columna Alegra | Destino |
|---|---|
| `Cantidad en Principal` | stock en **DermaLand Principal** (2 656 u.) |
| `Cantidad total − Cantidad en Principal` | stock en **Dermaland Cutis** (1 436 u.) |
| `Cantidad mínima en Principal` | `products.min_stock` |
| `Cantidad máxima en Principal` | `products.max_stock` |

La resta está validada: **0 filas de 1 370 tienen `Total < Principal`**, así que
nunca produce un negativo. 494 productos tendrían stock en Cutis; 126 de ellos
existen **solo** en Cutis (266 u.).

## Diseño

### Ubicación y permiso

Pantalla nueva **Productos → Importar desde Alegra** (`/productos/importar`),
visible y accesible solo para `super_admin | admin | manager`. La autorización de
rol se evalúa **en el servidor antes de leer el archivo**, siguiendo el patrón de
v0.98.0.

### Paso 1 — Subir

Un solo control de archivo. **El tipo se detecta solo** leyendo las cabeceras de
la fila 1:

- contiene `Código de barras` → archivo de **catálogo**
- contiene `Cantidad en Principal` → archivo de **inventario**
- ninguna de las dos → error legible ("Este archivo no parece un export de
  Alegra. Esperaba las columnas … ").

El usuario no elige tipo ni configura mapeos.

### Paso 2 — Revisar (el corazón del diseño)

El servidor calcula un **plan de importación** y lo devuelve sin escribir nada.
La pantalla muestra un resumen y pestañas.

Cifras esperadas con los archivos del 2026-08-01:

| Pestaña | Catálogo | Inventario |
|---|---|---|
| Emparejan | 1 347 (1 215 por barcode, 132 por nombre) | 1 323 (solo por nombre) |
| Se actualizan | 1 344 precios · 1 285 costos · 28 códigos de barra | 1 323 productos |
| Nuevos por crear | **54 productos** (68 filas − 14 duplicadas dentro del propio Excel) | **32** |
| Requieren decisión | **41** (28 parecidos + 7 colisiones + 3 precio + 3 barcode) | **19** (15 parecidos + 4 colisiones) |
| Sin cambios | resto | resto |

**Cascada de emparejamiento** (en orden, primera que acierta gana):

1. **Código de barras exacto** → match de alta confianza (1 215 filas del
   catálogo). El barcode se normaliza: solo dígitos, UPC-12 → EAN-13 con `0`
   delante.
2. **Nombre normalizado exacto** → match de alta confianza (132 del catálogo,
   1 323 del inventario). La normalización reusa la del script existente:
   mayúsculas, sin acentos, unidad pegada (`30 ML`→`30ML`), `SPF 50`→`SPF50`.
3. **Parecido ≥ 55 % por trigramas** → **NO empareja solo**; va a "Requieren
   decisión".
4. Nada de lo anterior → producto nuevo.

**Deduplicación dentro del propio archivo.** Antes de crear nada, las filas
nuevas se agrupan por nombre normalizado: el catálogo trae **14 filas que son
duplicado de otra fila del mismo archivo** (`PEP UP COLLAGEN BOOST`,
`EVEN UP MULTI-CORRECTION SERUM`, `TINT DU SOLEIL SPF 30 - LIGHT/MEDIUM/TAN`,
`LIP SHINE SPF 35 ×4`, `BARRIER PRO ×2`, `ALL CALM ×2`…, cada uno repetido 2
veces). Sin este paso se crearían 68 productos donde solo hay **54**. Si las
filas duplicadas traen datos distintos, el grupo va a "Requieren decisión".

**Pestaña "Requieren tu decisión"** — un caso por fila, con las dos versiones
lado a lado, el % de parecido y tres acciones:

```
86%   Excel:  PRIMADERM XPERTSUN URBAN NATURAL COLOR HIGH SPF 50 50 ML
      Tu BD:  Primaderm Xpertsun Urban Antural Color High SPF 50 50 ML
      [ Es el mismo ]  [ Es distinto → crear ]  [ Ignorar fila ]
```

Esto existe porque los parecidos son **dos problemas opuestos mezclados** y
ningún umbral los separa:

- *Mismo producto, escrito distinto:* `REGENER CREMA` ↔ `Regener Crema..`;
  `PRIMADERM … NATURAL` ↔ `… Antural` (typo en la BD);
  `HELIOCARE 360 MD AR EMULSION SPF 50` ↔ `Heliocare 360 MD A-R Emulsion 50ML`.
- *Productos distintos que se parecen 86 %:* `EUCERIN UREA 400 ML` vs
  `250 ML`; `GENOVE PREVIRIT 50 ML` vs `300 ML`; `ISISPHARMA SECALIA 500ML` vs
  `400 ML`.

También caen aquí:

- **Colisiones** (2+ filas del Excel apuntando al mismo producto): 7 en el
  catálogo, 4 en el inventario. Caso peor: `DELIVERY` aparece 5 veces con
  precios 100 / 500 / 300 / 1 / 175. El usuario elige cuál vale o las ignora.
  Además, `DELIVERY 2`…`DELIVERY 13` se parecen 73–80 % a `Delivery` y también
  caen aquí (son ~12 de los 28 parecidos del catálogo): probablemente sean
  servicios distintos, pero lo decide el usuario, no el algoritmo.
- **Conflicto de precio**: la BD ya tiene un precio > 0 y el Excel trae otro
  (3 casos: Radiocare 1 500→1 455, Vichy Dercos 1 300→2 240, A-derma
  1 687,40→2 085).
- **Conflicto de código de barras**: la BD ya tiene uno distinto (3 casos).

Las decisiones del usuario viajan de vuelta al servidor junto con el archivo al
aplicar; el plan se recalcula server-side (el cliente nunca dicta qué escribir).

### Paso 3 — Aplicar

Confirmación explícita con el conteo ("Aplicar 2 657 cambios"). El servidor
ejecuta el plan y devuelve un reporte descargable en Excel (reusando
`lib/reports/excel`) con una hoja por categoría: aplicados, creados, omitidos,
errores.

**Efectos en la base:**

- `products`: `UPDATE` de los campos mapeados; `INSERT` solo de los aprobados
  como nuevos, con `sku` generado por el mismo mecanismo que el alta manual.
- Stock: por cada diferencia entre lo que hay y lo que dice el archivo, un
  `inventory_movements` de tipo `adjustment_positive` / `adjustment_negative`
  con `reason = "Importación Alegra <fecha>"` y `reference = <import_id>`, más
  el ajuste correspondiente en `product_lots`.
- La cantidad objetivo se compara contra el **stock total del producto en esa
  sucursal**; el ajuste se reparte sobre los lotes existentes (consumiendo por
  FEFO para las bajas y acumulando en el lote más reciente para las altas). Si
  el producto no tiene ningún lote en esa sucursal y la cantidad objetivo es
  > 0, se crea un lote de ajuste `AJU-ALEGRA-<fecha>` sin vencimiento.
- `audit_logs`: una entrada por importación con el resumen y el `import_id`.

### Reglas que el importador nunca rompe

1. **No crea** un producto que empareja por código de barras o por nombre
   normalizado exacto.
2. **No pisa** un `price > 0` existente con uno distinto sin decisión explícita.
3. **No pisa** un `barcode` ya asignado con uno distinto sin decisión explícita.
4. **No pisa** una `description` que ya tenga contenido.
5. `business_id` **siempre** sale del JWT, nunca del archivo.
6. Cantidades negativas (1 fila: `GUANTES DE TELA MEDIEUM`, −1) y filas con
   `Total < Principal` (hoy 0) **se reportan, no se aplican**.
7. Nada se escribe sin la confirmación del paso 3.
8. El body se valida en el servidor con Zod (patrón v0.98.0) y el archivo tiene
   tope de tamaño y de filas.

### Fuera de alcance (YAGNI)

- **Vencimientos.** El catálogo trae 702, pero 389 ya vencidos y uno de 1905, y
  el vencimiento vive por lote. Se listan en el reporte para revisión manual.
- **Sincronización automática con Alegra por API.** Es carga manual de archivo.
- **Crear categorías, marcas o laboratorios.** Ambos archivos las traen vacías.
- **Servicios (`Tipo = Servicio`, 26 filas).** Se reportan pero no se crean;
  DELIVERY y los COMBO necesitan criterio de negocio aparte.

## Criterios de aceptación

1. Un usuario `admin` sube el archivo de catálogo y ve el plan **sin que se
   escriba nada** en la base.
2. El plan reporta 1 344 precios, 1 285 costos y 28 códigos de barra a
   actualizar, 41 casos que requieren decisión y **54** productos nuevos (no 68:
   las 14 filas duplicadas dentro del Excel se agrupan).
3. Un usuario `cajero` no puede abrir la pantalla ni llamar al endpoint (403).
4. Subir un `.xlsx` que no es de Alegra produce un error legible, no un stack
   trace.
5. Aplicar el catálogo deja **0 productos con `price = 0`** entre los
   emparejados, y el POS puede venderlos.
6. Aplicar el inventario deja el stock de Principal en 2 656 u. y el de Cutis en
   1 436 u., con un `inventory_movements` por cada diferencia.
7. Re-aplicar el mismo archivo dos veces seguidas **no genera cambios la segunda
   vez** (idempotente) ni crea productos duplicados.
8. Marcar "Es el mismo" en un caso dudoso actualiza el producto existente;
   marcar "Es distinto" crea uno nuevo; "Ignorar" no toca nada.
9. El reporte descargable cuadra con lo que efectivamente se escribió.

## Riesgos

- **R-IMP-01 · Emparejamiento por nombre.** El archivo de inventario no trae
  código de barras, así que 1 323 de sus emparejamientos dependen del nombre.
  Mitigación: normalización probada + los dudosos van a revisión humana + el
  reporte permite auditar después.
- **R-IMP-02 · Corrección grande de stock.** La primera aplicación va a bajar
  ~38 000 unidades fantasma en Principal y ~4 100 en Cutis. Es el
  comportamiento correcto, pero conviene tomar respaldo antes (`rest-json-backup.mjs`)
  y ejecutarlo una sola vez, revisando el plan con calma.
- **R-IMP-03 · "Cutis" es una inferencia.** El export no nombra el segundo
  almacén; que sea Cutis lo confirmó el usuario. La pantalla debe **mostrar las
  dos columnas etiquetadas** antes de aplicar para que se vea qué va a dónde.
