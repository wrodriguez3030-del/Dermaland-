# Changelog — DermaLand

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico (SemVer)](https://semver.org/lang/es/).

> **Regla de oro:** ningún cambio se sube a `main` sin una entrada aquí y un
> bump de versión. Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para el paso a paso.

## [Unreleased]
<!-- Agrega aquí lo que estés trabajando. Al publicar, muévelo a una versión nueva con fecha. -->

## [0.8.1] - 2026-06-26

### Fixed
- **Cobrar venta fallaba en producción con "un dato tiene formato inválido"
  (Postgres 22P02).** Causa raíz: el POS enviaba `cashier_id` y el `user_id`
  del pago como `"usr_cashier_1"` (placeholder, **no UUID**) a columnas
  `uuid not null references users(id)` → `invalid input syntax for type uuid`
  → fallaba TODO el guardado. Corregido en `proforma.create`: la identidad
  (`cashier_id`, payment `user_id`) ahora sale **del contexto autenticado**
  (`ctx.userId`, JWT), nunca del body.
- **Saneo defensivo de todo el payload de venta** antes de insertar:
  `branch_id` validado como UUID (body → sesión → error claro), `customer_id` /
  `product_id` / `product_lot_id` / `cash_register_session_id` vía
  `nullableUuid` (vacío / "walk-in" / no-UUID → `null`), montos vía `toDbMoney`
  (acepta `"RD$2,600.00"`, comas y espacios; rechaza NaN/Infinity con mensaje
  claro), `method_code` vía `mapPaymentMethod` (efectivo→cash, etc.; desconocido
  → "other").

### Added
- **Sanitizadores centrales** `server/repositories/supabase/sanitize.ts`:
  `isUuid`, `nullableUuid`, `requireUuid`, `toDbMoney`, `toDbMoneyNullable`,
  `toDbInt`, `toDbDate` (DD/MM/YYYY → ISO), `toDbTimestamp`, `mapPaymentMethod`.
  Lanzan `UserFacingRepositoryError` (mensaje amigable, sin jerga técnica) ante
  datos irrecuperables. **+21 tests.**

### Security
- La identidad del cajero/usuario de pago ya **no se confía del cliente**: se
  toma del JWT en el servidor. DGII real permanece apagado.

### Added
### Changed
### Fixed
### Removed
### Security

---

## [0.8.0] - 2026-06-26

### Added
- **Módulo DGII / Facturación reorganizado** con submenús: Configuración de
  facturación, Numeraciones / Secuencias, Reglas automáticas de e-CF,
  Comprobantes emitidos, Ambiente e-CF, Certificado digital, Logs DGII /
  Historial (más Activar / Habilitación existentes).
- **Configuración de facturación** (`/dgii/facturacion/configuracion`, solo
  ADMIN): forma de facturación principal (NCF/e-CF/Ambos), modo de uso
  (manual/automático), ambiente e-CF (mock…producción), reglas por método de
  pago, estrategia de selección de cierre y **porcentaje e-CF de cierre**
  (`billing_settings.cash_transfer_ecf_percentage`, default 15%, 0–100).
- **Reglas automáticas de e-CF** (`/dgii/facturacion/reglas`): tarjeta → e-CF
  inmediato; efectivo/transferencia → pendiente para cierre; mixto con tarjeta
  → e-CF inmediato por venta completa (no divide); proforma nunca consume
  secuencia fiscal real.
- **Store `billing-settings`** por `business_id` (localStorage) + permisos de
  módulo (ADMIN edita; caja sólo ve). Emisión real bloqueada por diseño salvo
  ambiente `producción`.
- **Motor de reglas config-aware** (`auto-billing-rules.ts`) y **selección de
  cierre con redondeo hacia arriba por factura completa** (estrategias
  últimas/primeras/manual) — nunca divide ni altera montos.
- **Cierre de caja con facturación electrónica**: porcentaje gobernado por ADMIN
  (solo lectura en el cierre), sección e-CF con objetivo / generado / diferencia
  por redondeo / pendiente, botones Generar e-CF / Omitir, y **snapshot
  inmutable** del % y la diferencia en el cierre (cambios futuros no alteran
  cierres anteriores).
- **Migración aditiva `0014_billing_settings_ecf.sql`** (no destructiva, RLS por
  business_id): `billing_settings`, columnas e-CF en `cash_closings`,
  `cash_closing_ecf_items`, `dgii_logs`. **No aplicada a base real** (la app
  corre en `DATA_SOURCE=mock`).
- **62 tests nuevos** (settings, reglas por método de pago, mixtos, redondeo
  hacia arriba con el ejemplo RD$10,000 · 15% → 1,800 / dif 300).
- **POS cableado al motor de reglas:** el modal de cobro muestra, según la
  Configuración de facturación y los pagos (incl. mixtos), si el comprobante es
  **e-CF inmediato al cobrar** o queda **pendiente para cierre de caja**, con la
  razón visible.
- **Máquina de estados e-CF (mock, §12):** `ecf-lifecycle.ts` con los estados
  internos (borrador → generado_xml → firmado → enviado_dgii → recibido_dgii →
  aceptado/rechazado/pendiente → enviado_receptor → acuse_recibido →
  aprobado_comercialmente → almacenado / anulado), transiciones válidas y
  **guards de envío real** (bloquea salvo producción + emisión real +
  certificado + rango + endpoint + business autorizado + config completa).
  `simulateEcfFlow` recorre el flujo en mock sin tocar DGII ni consumir
  secuencia real; visualizado en `/dgii/preview/[id]`. +12 tests.
- **Ticket 80mm con identificadores e-CF (§13.B):** para facturas, el ticket
  térmico imprime código de seguridad (demo), fecha de firma, URL de validación
  y la nota de Envío Diferido (24 h). El QR completo sigue en la representación
  impresa PDF (canónica). Sin librerías UI nuevas.
- **Logs DGII / Historial (§1, §12):** store `dgii-logs` (localStorage, por
  business_id, mapea a tabla `dgii_logs`) + pantalla `/dgii/logs` con bitácora
  (fecha, acción, e-NCF, ambiente, estado, mensaje, modo mock/real). El "Flujo
  e-CF (demo)" de la vista previa puede **registrar su traza en los logs** con
  un botón. +4 tests.
- **Comprobantes emitidos:** columna **Ambiente** (badge gris mock / naranja
  testecf-certecf / verde producción) en `/dgii/facturas`.
- Sidebar: "Logs DGII / Historial" → `/dgii/logs`; "Envíos a DGII" queda como
  ítem aparte.

### Security
- **DGII real permanece APAGADO.** mock/demo nunca consume secuencia fiscal
  real; `realEmissionEnabled` arranca `false` y solo es activable en ambiente
  `producción`. Sin certificados reales, sin endpoints reales, sin envío real.

---

## [0.7.1] - 2026-06-23

### Fixed
- **Cobrar en POS fallaba con un error técnico "SupabaseRepository: …".** Causa
  raíz: el insert de `proforma_items` enviaba `kind: "product"`, pero la columna
  tiene `check (kind in ('bien','servicio'))` → **23514 check_violation** en cada
  ítem → fallaba TODO el cobro. Corregido a `kind: "bien"` (los productos son
  "bien" en DGII). El resto de enums del cobro (status, método de pago,
  billing_type) ya eran válidos.
- **Auditoría global: ningún error técnico llega a la UI.** 33 rutas `/api/*`
  devolvían el mensaje crudo (`(e as Error).message`) → podían filtrar
  "SupabaseRepository: …" / SQL / detalles. Ahora **todas** usan
  `toUserFacingMessage(e, <fallback amigable>)`, que loguea el detalle en el
  servidor y devuelve un mensaje claro.

### Changed
- **Mapeador central de errores** (`client.ts`): nuevo `friendlyForPgCode(code)`
  (23505 duplicado, 23503 referencia/en uso, 23502 falta dato, 23514 reglas,
  22P02 formato, 22007/22008 fecha, 42501 permiso, 08xxx conexión). `failRepo` y
  `toUserFacingMessage` lo reutilizan; `toUserFacingMessage` ahora mapea el código
  PG **aunque el repo lance `SupabaseRepositoryError`** (lee `error.cause`), así
  el usuario ve "No tienes permiso…", "Ya existe un registro…", etc., nunca el
  prefijo técnico. Alias `mapSupabaseErrorToUserMessage`. El wrapper de cobro
  muestra "No se pudo conectar con el servidor. Intenta nuevamente." ante fallos
  de red.

---

## [0.7.0] - 2026-06-23

### Added
- **POS: productos FAVORITOS.** Cada tarjeta tiene una ⭐ (vacía = "Agregar a
  favoritos", llena = "Quitar de favoritos"). Toggle **"Solo favoritos"** en la
  barra y **favoritos primero** en el orden por defecto. Empty-state guía cuando
  no hay favoritos. **No afecta stock/inventario.** Persistencia por equipo
  (localStorage); migración `0013` lista (tabla `pos_product_favorites`, RLS por
  business_id) para favoritos por negocio cuando se aplique con acceso a DB.
- **POS: DESCUENTO por producto (por línea).** Botón de descuento en cada línea
  del carrito → mini-modal "Descuento del producto" (Porcentaje % / Monto RD$ /
  Sin descuento + motivo opcional), con vista previa. Recalcula el total de la
  línea, el ITBIS (sobre la base neta) y el total de la venta. Validaciones:
  no negativo, % ≤ 100, monto ≤ subtotal de línea, sin descuento a producto con
  precio 0, nunca total negativo. El resumen muestra **Subtotal bruto /
  Descuentos productos / Descuento global / ITBIS / Total**. El descuento por
  línea persiste en `proforma_items.discount` y se ve en el ticket/PDF
  (`receipt-80mm` muestra "· Desc. RD$…"). El descuento global sigue funcionando.
- Motor puro `cart-line.ts` (`lineAmounts`, `cartTotals`, `validateLineDiscount`)
  + `favorites-store.ts`, con tests.

### Notes
- La migración `0013` (favoritos por negocio + columnas `discount_type/value/
  reason` en `proforma_items`) NO se pudo aplicar automáticamente (sin acceso DDL
  al Supabase Cloud: `SUPABASE_DB_URL` es placeholder). Ninguna feature depende
  de ella para funcionar: favoritos usa localStorage y el descuento por línea usa
  la columna `discount` ya existente. Aplicar `0013` en el SQL editor habilita
  favoritos compartidos por negocio y los metadatos de descuento.

---

## [0.6.2] - 2026-06-22

### Changed
- **Stock por lote reorganizado como las demás pantallas.** Ordenamiento por
  defecto **Cantidad mayor→menor** (lotes con más unidades arriba, 0 abajo) y
  columnas ordenables (Producto, Lote, Sucursal, Cantidad, Vence, Días, Estado,
  Valor) con `useTableSort`/`SortableTH`. Filtros funcionales: búsqueda
  (producto/SKU/lote/marca/laboratorio), estado (Todos / Disponible / Sin stock /
  Por vencer / Vencido / Cuarentena / Recall) y sucursal (sucursales activas
  reales, sin UUID). Acciones por fila (Ver detalle, Editar, Ver movimientos,
  Mover a cuarentena / Liberar) — estas dos ahora **funcionan de verdad**
  (`quarantineLotAnywhere`/`releaseLotAnywhere`, antes solo mostraban un toast).

### Fixed
- Stock por lote usaba **`getProductById` (catálogo MOCK)** → en Supabase el
  `product_id` real no existe en el mock y el producto salía sin nombre/SKU/
  imagen. Ahora resuelve los productos desde `useProducts()` (misma fuente que
  Stock actual y POS). `current_quantity` y `unit_cost` para cantidad y valor.

---

## [0.6.1] - 2026-06-22

### Fixed
- **Inventario seguía en 0 aunque Productos/POS mostraban stock (causa raíz
  real).** Hipótesis F confirmada con datos: A-derma tiene 1000 unid en
  `product_lots` de DermaLand Cutis, pero Inventario aplicaba
  **`onlyActiveBranches(useAllLots())`**. `onlyActiveBranches` filtra por
  `listActiveBranchIds()`, que lee el **store mock síncrono** (localStorage), no
  las sucursales reales de Supabase → el set activo era `{br_santiago}` (mock) y
  los lotes reales (branch_id UUID `0a1fd664…`) quedaban **todos excluidos** → 0.
  Productos/POS NO usaban ese filtro, por eso sí mostraban el stock. Fix: se
  eliminó `onlyActiveBranches` de Inventario, Stock por lote y Detalle de
  producto — ahora usan los lotes reales directos (`useAllLots`) y filtran por la
  sucursal seleccionada con el mismo motor que POS/Productos.

### Added
- **Motor ÚNICO de stock `features/inventory/inventory-stock-engine.ts`** (fuente
  de verdad documentada): `getSellableStockForBranch`, `getStockByBranch`,
  `getTotalStockAcrossActiveBranches`, `getNextSellableLotFEFO`,
  `getInventoryRows`, `getInventoryStockSummary` — todas puras sobre los lotes de
  `useAllLots()` (Supabase, RLS). Mismo predicado `isLotSellable` que POS y
  Productos: ninguna pantalla recalcula stock por su cuenta.
- Test que prueba que **Inventario == Productos == POS** para A-derma en Cutis
  (1000) y Principal (130), más suma por `current_quantity`/`branch_id`, valor,
  bajo mínimo, sin stock y FEFO.

---

## [0.6.0] - 2026-06-22

### Fixed
- **Inventario > Stock actual mostraba todo en 0 / "Sin stock" (y ~1354
  productos).** Causa raíz: la página iteraba **`mockProducts`** (catálogo MOCK)
  en vez de `useProducts()` (productos reales de Supabase). En Supabase los lotes
  tienen el `productId` real, que NO existe en el mock → `lots.filter(l =>
  l.productId === p.id)` no coincidía con nada → stock 0 para todos; "1354" era el
  nº de productos mock. Ahora usa los productos reales y el motor único de stock.

### Added
- **Motor central de stock `inventoryRowForBranch(lots, productId, branchId)`**
  (misma regla `isLotSellable` que POS y Productos): unidades vendibles, valor
  (Σ cantidad·costo de lotes vendibles), nº de lotes, y banderas
  vencido/cuarentena/recall/por-vencer. Excluye vencidos, cuarentena, recall y
  cantidad 0; respeta `branch_id` y `business_id` (RLS).
- **Ordenamiento por columnas** en Stock actual (Producto, Marca, Categoría,
  Laboratorio, Lotes, Stock, Mín, Valor). **Por defecto: Stock mayor→menor**
  (los productos con más unidades arriba, los sin stock abajo).
- **Filtros**: búsqueda (producto/SKU/lote/marca/categoría/laboratorio), marca,
  categoría, laboratorio y estado (Todos / Con stock / Sin stock / Bajo mínimo /
  Por vencer / Vencidos / Cuarentena / Recall).
- **Columnas** Marca, Categoría, Laboratorio + acciones por fila (Ver detalle,
  Editar, Agregar stock, Ver lotes). El alta de stock preselecciona la sucursal
  efectiva y refresca la tabla al guardar. "Sucursal actual: {nombre}" — nunca
  UUID/almacén. La sucursal efectiva es la seleccionada arriba (o el deep-link
  `?branch=`).

---

## [0.5.4] - 2026-06-22

### Fixed
- **Abrir caja fallaba con un error técnico.** Causa raíz: no existía ninguna
  fila en `cash_registers` para la sucursal, así que `cashRegister.open` lanzaba
  "Caja registradora no configurada para la sucursal" (un `SupabaseRepositoryError`
  cuyo mensaje técnico llegaba tal cual al usuario). Fix: la caja registradora es
  interna y el usuario NUNCA la configura — ahora se crea automáticamente por
  sucursal (`ensureCashRegisterForBranch`, idempotente, code determinista). El
  POST `/api/cash` y `/api/cash/[id]` traducen cualquier error a mensaje
  amigable (`toUserFacingMessage`), nunca exponen `SupabaseRepository`/SQL/UUID.

### Added
- Validaciones amigables al abrir caja: monto válido (≥0), sucursal y usuario
  requeridos, y **detección de caja ya abierta** ("Ya existe una caja abierta
  para esta sucursal."). La caja se abre para la **sucursal seleccionada arriba**
  si es una sucursal activa del negocio (validada en el servidor); si no, la del
  contexto. Nunca cross-business (RLS).

---

## [0.5.3] - 2026-06-22

### Fixed
- **Los clientes existentes no aparecían en el buscador de cliente del POS**
  (p. ej. WILLIAN R RODRIGUEZ existía en /clientes pero "WILL" no lo encontraba
  en POS). Causa raíz: el POS pasaba `businessId="biz_dermaland"` (constante
  mock) a `CustomerSearchSelect`, y `searchClients` filtra
  `c.businessId === businessId`. En Supabase los clientes reales tienen
  `businessId` = el UUID del negocio (`00000000-…-d001`), así que ese filtro los
  **excluía a todos** → "No se encontraron clientes". Fix: el POS deja de pasar
  ese `businessId` — los clientes ya vienen scopeados por `business_id` (RLS en
  Supabase, single-tenant en mock), así que el filtro client-side sobraba y
  rompía. El helper `searchClients` (nombre/apellido, teléfono y documento con o
  sin guiones, email, customer number, todo normalizado) ya era correcto; ahora
  recibe la lista completa y encuentra al cliente por WILL / RODRIGUEZ /
  8297141975 / 829-714-1975 / 03103274282 / 031-0327428-2 / wrodriguez.

### Notes
- /clientes y POS usan la MISMA fuente (`useCustomers()` →
  `fetchCustomersFromServer()` con RLS por `business_id`, excluye `deleted_at`).
  El repo `customer.list` no tiene límite artificial. No hay lógica duplicada.

---

## [0.5.2] - 2026-06-22

### Fixed
- **El POS no se actualizaba al cambiar la sucursal en el selector superior**
  (mostraba una sucursal distinta a la seleccionada arriba). Causa raíz: cada
  llamada a `useCurrentBranch()` tenía su **propio `useState`** y el efecto de
  sincronización solo dependía de la lista de sucursales activas, así que el
  cambio hecho en una instancia (selector superior) **no notificaba** a las
  demás (POS, Productos). Ahora `setBranchId` emite un evento
  (`dermaland:current-branch-changed`) y todas las instancias se re-sincronizan
  al instante desde una **única fuente** (localStorage), además de `storage`
  para multi-pestaña. El POS muestra exactamente la sucursal de arriba y el
  stock/FEFO recalcula solo.

### Added
- **POS: confirmación al cambiar de sucursal con carrito no vacío.** Si hay
  productos en la venta y se cambia la sucursal, se pide confirmación
  ("Cambiar de sucursal limpiará la venta actual porque el stock depende de la
  sucursal. ¿Deseas continuar?"). Confirmar limpia el carrito; cancelar revierte
  a la sucursal anterior. Carrito vacío cambia sin preguntar. (`ConfirmDialog`).

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
