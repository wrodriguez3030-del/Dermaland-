# Changelog — DermaLand

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico (SemVer)](https://semver.org/lang/es/).

> **Regla de oro:** ningún cambio se sube a `main` sin una entrada aquí y un
> bump de versión. Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para el paso a paso.

## [Unreleased]
<!-- Agrega aquí lo que estés trabajando. Al publicar, muévelo a una versión nueva con fecha. -->

## [0.61.0] - 2026-07-11

**Migración del Inventario físico a Supabase — Fase 3 (ESCRITURAS backend).**
Backend, sin cambios de UI todavía (las páginas siguen usando el store cliente/
mock hasta la Fase 2). **No muta stock ni genera `inventory_movements`** (el
ajuste de existencias es un paso posterior). Diseño en
`docs/conteo-fisico-supabase-migracion.md`.

- **Repo Supabase** `inventory-counts.ts`: `create` (persiste cabecera + ítems;
  resuelve el almacén de la sucursal si no viene; genera ids de servidor;
  `business_id` del ctx, nunca del body), `recordScan` (idempotente vía índice
  único `(device_id, offline_scan_id)` con `upsert ignoreDuplicates`),
  `submit`/`approve`/`reject` (status + timestamps, verifican filas afectadas:
  UPDATE de 0 filas = error, no éxito falso).
- **Contrato** `InventoryCountRepository.create` + tipos `NewInventoryCount` /
  `NewInventoryCountItem` en `repositories/types.ts`. **Paridad mock** con
  overlay en memoria (`__resetInventoryCountMockWrites`) — test de 4 casos
  (create→list/byId/items, aislamiento por tenant, submit/approve/reject,
  recordScan).
- **API routes**: `POST /api/inventory-counts` (crear) y
  `POST /api/inventory-counts/[id]` (`{action: submit|approve|reject, reason?}`).
  Gated 409 en modo mock.
- Verificado contra el esquema real: CHECK de `status`
  (draft/in_progress/paused/submitted/reviewed/approved/rejected/adjusted/
  cancelled) y FKs (items/scans → counts) e índice idempotente. typecheck +
  suite (1680) + build verdes.
- **Pendiente:** Fase 2 (cablear UI a estas API con reconciliación de ids
  cliente↔servidor y manejo offline) y Fase 3b (ajustes → `inventory_movements`
  + stock).

## [0.60.0] - 2026-07-11

**Migración del Inventario físico a Supabase — Fase 1 (LECTURA).** Backend, sin
cambios de UI todavía (las páginas siguen leyendo mock hasta la Fase 2). **No
toca DGII, inventario real ni ventas.** Diseño en
`docs/conteo-fisico-supabase-migracion.md`.

- **Repo Supabase de lectura** `server/repositories/supabase/inventory-counts.ts`:
  `list` / `byId` / `items` / `scans` reales sobre `inventory_counts`,
  `inventory_count_items`, `inventory_count_scans`, con filtro defensivo
  `business_id = ctx.businessId` (además de RLS). Reemplaza los stubs en la
  factory (`supabase/index.ts`). Escrituras (recordScan/submit/approve/reject)
  siguen pendientes (Fase 3) y rechazan con mensaje claro.
- **Mappers** snake→camel en `mappers.ts`: `inventoryCountRowToTs`,
  `inventoryCountItemRowToTs`, `inventoryCountScanRowToTs` (deriva
  `differenceQuantity` = contado−esperado si la columna viene null; `assigned_to`
  null → `[]`). Test nuevo (6 casos).
- **API routes** de lectura (gated 409 en modo mock, `no-store`, RLS por JWT):
  `GET /api/inventory-counts` (lista) y `GET /api/inventory-counts/[id]`
  (cabecera + ítems + escaneos; 404 si no existe).
- Verificado: las 5 tablas `inventory_count*` existen con **RLS activo** (1
  policy c/u) y están vacías (sin backfill). typecheck + suite (1676) + build
  verdes.

## [0.59.0] - 2026-07-11

**Reporte de Inventario físico (Reportes › Conteos): el Excel y el PDF ahora
traen Sucursal, Laboratorio, Marca, Categoría, Código de barra y Vencimiento.**
Antes las tablas de ítems solo tenían Producto, SKU, Lote, cantidades y estado.
**No toca DGII, inventario ni ventas.**

- **Excel** (`counts-report-excel.ts`): las hojas Diferencias / No encontrados /
  Detalle usan el MISMO orden de columnas descriptivas que el Excel de detalle
  por conteo (`physical-count-export.ts`): SKU · Código de barra · Producto ·
  Laboratorio · Marca · Categoría · Sucursal · Lote · Vencimiento · Stock
  sistema · Cantidad contada · Diferencia · Estado · Último escaneo.
- **PDF** (`counts-report-pdf.ts`, landscape): agrega Marca, Laboratorio,
  Sucursal, Lote y Vencimiento (Categoría y Código de barra van solo en Excel
  por ancho de página).
- **Cómo se resuelven:** los armadores son puros y reciben `lookups`
  (`CountsReportLookups`) para marca/laboratorio/categoría/sucursal y el barcode
  del producto. La **sucursal por ítem** se deriva del conteo al que pertenece
  (`inventoryCountId` → `count.branchId`); el **vencimiento** ya venía en el ítem
  (`expiresAt`). En `reportes/conteos` los resolvers usan el catálogo (los mismos
  que la pantalla de detalle).
- El Excel de detalle por conteo (`conteo-fisico/[id]`) ya incluía todas estas
  columnas; no cambia.
- Test nuevo `counts-report-excel.test.ts` (5 casos: columnas presentes, valores
  resueltos, sucursal por ítem, hoja Diferencias). typecheck + suite (1670)
  verdes.
- **Nota:** el módulo de inventario físico corre sobre datos de ejemplo (mock),
  no Supabase; el reporte muestra los conteos de ejemplo hasta que se migre el
  módulo (diseño en `docs/conteo-fisico-supabase-migracion.md`).

## [0.58.3] - 2026-07-11

**Fix: buscar por código de barra en Stock (`/inventario`) no funcionaba.** Al
teclear/escanear un EAN-13 en el buscador de "Stock actual" no devolvía nada,
aunque el producto sí tuviera el código. **No toca DGII, inventario ni ventas.**

- **Causa raíz:** el texto de búsqueda de la pantalla de Stock se armaba con
  nombre + SKU + marca + categoría + laboratorio + lote, pero **omitía
  `barcode`**. La pantalla de Productos (`/productos`) sí lo incluía; ambas
  quedan ahora consistentes. (Se hace evidente tras cargar los barcodes en
  v0.58.2.)
- **Fix de raíz:** extraído el filtro de texto a una función pura testeable
  `features/inventory/inventory-search.ts` (`matchesInventorySearch`) que
  incluye el código de barra, con test de regresión (`inventory-search.test.ts`,
  7 casos). Placeholder actualizado a "Buscar producto, código de barra, SKU,
  lote…".
- typecheck + suite completa (1665 tests) verdes.

## [0.58.2] - 2026-07-11

**Datos: importados 1214 códigos de barra (EAN-13) al catálogo desde el export
de Alegra.** Solo datos en Supabase (`products.barcode`), sin cambios de código
de la app ni deploy. **No toca DGII real, inventario ni ventas.**

- **Fuente:** `Alegra - Productos-servicios - DermaLand -.xlsx` (1436 filas,
  columnas `Nombre` + `Código de barra (EAN-13)`). Emparejamiento por **nombre
  normalizado** (mayúsculas, sin acentos, unidad pegada `30 ML`→`30ML`,
  `SPF 50`→`SPF50`), ya que el Excel no trae SKU.
- **Aplicados 1214 UPDATE de alta confianza**: match de nombre EXACTO tras
  normalizar + dígito de control EAN-13 válido. `products.barcode` pasó de 14 a
  **1228 productos** con código (todos de 13 dígitos). 127 quedan sin barcode.
- **UPC-12 → EAN-13:** 113 códigos de 12 dígitos (NEOSTRATA, THE ORDINARY,
  EOS…) se guardaron con un `0` adelante, siguiendo la convención de la casa
  (los 14 previos eran de 13 dígitos).
- **Seguridad:** solo `UPDATE ... WHERE barcode IS NULL AND deleted_at IS NULL`;
  nunca crea productos (no duplica) ni sobrescribe barcodes existentes. Los
  1214 barcodes son únicos entre sí y no colisionan con los previos (respeta el
  índice único parcial `products(business_id, barcode)`). **Reversible** con el
  registro `data/barcode-import-2026-07-11/barcode-affected.json`.
- **No aplicados (dejados para revisión manual, sin tocar la BD):** 158 filas
  sin barcode en el Excel, 28 productos genuinamente distintos (sin match), 18
  con EAN malformado, 11 con dígito de control inválido (probables typos, p. ej.
  A-derma `328770110166` → debería ser `3282770110166`), 4 fuzzy (variantes
  Avene Dermabsolu) y 2 duplicados del Excel. Detalle en
  `data/barcode-import-2026-07-11/barcode-review.json` y
  `barcode-invalid-checksum.json`.
- **Reproducible:** `scripts/import-barcodes-from-alegra.mjs` (dry-run por
  defecto; `--apply` para escribir). Idempotente: reejecutar no re-toca nada.

## [0.58.1] - 2026-07-11

**Datos: resueltos los 3 dobles conteos proforma↔factura pendientes.** Solo
datos en Supabase (`source_proforma_id`), sin cambios de código ni deploy.
**No toca DGII real.**

- Decisión del dueño (2026-07-11): PROF-2026-89148 → B0200001301 y
  PROF-2026-89236 → B0200001302 (conversión en pareja del 2026-07-04, facturas
  emitidas con 0.9 s de diferencia); PROF-2026-28372 → PROF-2026-71224 (primera
  factura emitida tras la proforma el 2026-06-27).
- UPDATE con guarda `source_proforma_id IS NULL`, reversible (basta ponerlo en
  NULL). Las métricas centrales descuentan solas: cliente CLI-420678 pasó de
  16 compras / RD$34,908.00 a **13 compras / RD$29,628.00** (−RD$5,280
  duplicados).
- Auditoría regenerada (`scripts/audit-customer-sales-relations.mjs`):
  `posiblesDoblesConteos: 0`. Snapshot en `data/customer-relations-audit.json`.

## [0.58.0] - 2026-07-10

**Fix: falso "duplicado" al editar productos.** Editar un producto y asignarle un
SKU o código de barra que solo tenía un producto **eliminado (soft-delete)**
fallaba con el mensaje genérico "Ya existe un registro con esos datos.". **No
toca DGII real, inventario ni ventas.**

- **Causa raíz:** los índices únicos de `products` (`business_id+sku` y
  `business_id+barcode`) **no excluían los soft-deleted** → un producto borrado
  seguía "reservando" su SKU/barcode. Caso real: barcode `8436574360677` retenido
  por un "RADIOCARE" borrado bloqueaba a "Radiocare Ultra Crema Reparadora".
- **Migración `0025_products_soft_delete_unique.sql`** (aplicada por MCP a
  `sntcvyozbhrgicwmtcoh`, auditada: 0 duplicados entre productos vivos): índices
  únicos **parciales** `WHERE deleted_at IS NULL` (SKU pasa de constraint a índice
  parcial; barcode recreado). Unicidad real = `business_id + sku/barcode` **entre
  productos vivos**. Desbloqueó 2 barcodes retenidos por borrados.
- **Mensajes por-campo (§5)** en `product.create`/`update`: SKU duplicado → "Ya
  existe otro producto con este SKU."; barcode duplicado → "El código de barra
  {código} ya está asignado a otro producto." Nunca se muestra el genérico ni
  detalles técnicos (23505/constraint/SQL/UUID/PGRST). `create` ya no reintenta
  regenerando SKU cuando el choque es de barcode. Helper puro `productUniqueMessage`
  + `pgUniqueConstraint` con tests.
- El UPDATE sigue siendo un UPDATE por `business_id+id` (no INSERT/upsert), solo
  campos provistos; no toca lotes, movimientos, ventas ni SKU. Probado en la BD
  (transacción revertida): el edit que fallaba ahora guarda sin 23505.

## [0.57.0] - 2026-07-10

**Devoluciones/ajustes de comisión (§12) — cierre de la unificación.** Al anular
una venta, sus incentivos se resuelven en `sales_incentives` y ambos módulos
reflejan el mismo ajuste. **No toca DGII real.**

- `voidIncentivesForCancelledSale` (invocado por `PATCH /api/proformas/[id]`
  `{action:"cancel"}`): pendientes/aprobados → **anulados** (`voided`); pagados →
  **ajuste negativo** (`status: adjusted`, `adjustment_amount = −incentivo`) sin
  borrar el original → saldo de recuperación.
- La capa central y el adaptador propagan `adjustment_amount`: KPIs nuevos
  **"Ajustes (devoluciones)"** y **"Comisión neta"** (= total + ajustes) en
  `Reportes > Comisión ventas` y en `Ventas > Incentivos`, solo cuando hay
  ajustes. Las líneas `adjusted`/`voided` ya no cuentan como pendiente/pagada.
- Tipos: `IncentiveRecord.adjustmentAmount`, `CommissionKpis.adjustments/
  netCommission` y `CommissionLine.adjustment` (opcionales); `sales_incentives`
  en `database.types.ts` actualizado (`adjustment_amount`, `approved_at`,
  `payment_method_group`). Test de ajuste en `central.test.ts`.

## [0.56.0] - 2026-07-10

**Unificación Incentivos ↔ Comisión ventas — cierre (pago bidireccional).** El
pago de comisiones desde *Reportes > Comisión ventas* ahora opera sobre
`sales_incentives` por `incentive_id` (mismo endpoint `/api/incentives/pay` que
*Ventas > Incentivos*) → pagar en cualquiera de los dos módulos deja el MISMO
estado en ambos (antes Comisión escribía `commission_payouts` por comprobante y
no se reflejaba en Incentivos). **No toca DGII real.**

- El reporte de Comisión lee el estado de pago del snapshot (se quitó el overlay
  `payoutByComprobante`). Selección por id de incentivo; una sola acción "Pagar
  (crear lote)".
- Se retiró de la pantalla de Comisión la maquinaria legacy por comprobante
  (`commission-payout/-batch/-audit` stores, modales de reglas y de pagos): las
  reglas y los pagos se gestionan en Incentivos (§7/§17). Se conservan las
  exclusiones manuales. El motor dinámico `commission-engine.ts` queda solo como
  proveedor de tipos/legacy (sus tests siguen verdes).

## [0.55.0] - 2026-07-10

**Unificación Incentivos ↔ Comisión ventas — Fase 2 (cutover a fuente única).**
El reporte *Reportes > Comisión ventas* deja de recalcular dinámicamente y ahora
**lee de los snapshots `sales_incentives`** — los MISMOS que muestra *Ventas >
Incentivos*. Mismo importe, vendedor, regla y estado en ambos módulos, sin
cálculo duplicado. **No toca DGII real.**

- **Migración `0024_commission_unify.sql` APLICADA** a Supabase (`sntcvyozbhrgicwmtcoh`)
  vía MCP: estados únicos `pending/approved/paid/adjusted/voided`,
  `adjustment_amount`, `payment_method_group`, reglas superconjunto
  (`payment_groups/seller_id/branch_id/priority`), tabla
  `commission_payment_batch_items` (RLS por `business_id`, advisor de seguridad
  sin alertas).
- **Backfill (idempotente):** se convirtieron las 2 reglas de comisión a reglas
  de incentivo (`sales_incentive_rules`) y se generaron los snapshots de las 4
  ventas con vendedor (Willian 2×50.59, Darío 2×50.59; base 1686.44, regla 3%
  efectivo; total **RD$202.36**). Las ventas sin vendedor no comisionan (no hay a
  quién pagar).
- **Adaptador** `features/commission/report-from-incentives.ts`: construye el
  `CommissionReport` (KPIs, por vendedor/método/sucursal, detalle) que consumen
  la pantalla, el Excel y el PDF, pero a partir de los snapshots enriquecidos con
  su venta. Test de paridad `report-from-incentives.test.ts` (5 casos) + capa
  central `central.test.ts` (7). El flujo de pagos/exclusiones por comprobante de
  la página se conserva intacto.

## [0.54.0] - 2026-07-10

**Unificación Incentivos ↔ Comisión ventas — Fase 1 (capa central + flujo
único).** Los módulos *Ventas > Incentivos* y *Reportes > Comisión ventas* pasan
a trabajar como partes del mismo flujo, con una **capa central de agregación**
como fuente única de KPIs y ranking. **No toca DGII real.**

- **Capa central** `features/commission/central.ts`: `getCommissionSummary`,
  `getCommissionBySeller`, `getTopSeller`, `applyCommissionFilters` — deriva los
  KPIs de comisión de los MISMOS snapshots `sales_incentives` que usa Incentivos
  (envuelve `summarize`/`rankSellers`). **Test de paridad** (`central.test.ts`,
  7 casos) prueba que ambos módulos muestran el mismo importe, vendedor, regla y
  estado desde una sola fuente.
- **Flujo único / navegación cruzada:** Incentivos gana **“Ver reporte
  completo”** (preserva el vendedor filtrado) y el ranking por vendedor enlaza a
  `/reportes/comision-ventas?seller=…`; Comisión ventas gana **“Gestionar reglas
  en Incentivos”** (§7: las reglas se administran en Incentivos) y ahora lee
  `?seller=&from=&to=` de la URL para abrir ya filtrado.
- **Auditoría (dry-run, solo lectura)** `scripts/audit-incentives-commissions.mjs`:
  reporta reglas/incentivos/duplicados/huérfanos/ventas con-sin vendedor.
  Resultado en prod: `sales_incentives` vacía, 2 reglas de comisión, 16 ventas
  (4 con vendedor) — sin duplicados ni datos que migrar.
- **Preparado para el cutover final** (Fase 2, requiere aplicar DDL por el SQL
  Editor): migración `0024_commission_unify.sql` (estados únicos
  pending/approved/paid/adjusted/voided, `adjustment_amount`, método
  materializado, reglas superconjunto, `commission_payment_batch_items`) y el
  diseño completo en `docs/reports/UNIFICACION_INCENTIVOS_COMISION.md`.

## [0.53.0] - 2026-07-09

**Tarjetas del Dashboard navegables (KPI → detalle con filtro).** Las 8 tarjetas
KPI del dashboard ahora son enlaces reales: toda la tarjeta es clicable, con
cursor pointer, hover suave, foco visible por teclado (Enter navega) y
`aria-label`. Cada una abre su pantalla de detalle ya filtrada:

| Tarjeta | Destino | Filtro |
|---|---|---|
| Ventas hoy | `/ventas?period=today` | día de hoy |
| Productos en catálogo | `/productos` | todos (activos + inactivos) |
| Lotes próximos a vencer | `/inventario/vencimientos?days=90` | ≤ 90 días |
| Lotes bloqueados | `/inventario/bloqueados` *(nueva)* | cuarentena + recall |
| Clientes nuevos | `/clientes?created=this_month` | este mes |
| Inventarios pendientes | `/conteo-fisico?status=pending` | borrador + en progreso |
| Caja actual | `/caja` | sesión activa (o abrir caja) |
| DGII | `/dgii` | estado real del módulo |

**Coherencia KPI ↔ detalle (una sola fuente de datos).** El número de cada KPI
coincide exactamente con lo que muestra su pantalla destino:

- Nuevo módulo puro `features/inventory/lot-selectors.ts` (`lotsExpiringWithin`,
  `blockedLots`, `matchesExpiryDayFilter`) que consumen tanto el dashboard como
  Vencimientos y la nueva vista Bloqueados.
- "Lotes próximos a vencer" ya no está capado a 5 (contaba mal) ni ignora la
  sucursal; usa el mismo predicado que `?days=90`.
- "Lotes bloqueados" = cuarentena + recall (cuadra con su etiqueta); nueva vista
  unificada `/inventario/bloqueados` con pestañas Todos/Cuarentena/Recall cuyo
  total "Todos" == el KPI.
- "Ventas hoy" usa la misma definición (`isInvoiceDocument` + hoy) que `/ventas`.
- "Clientes nuevos" e "Inventarios pendientes" comparten predicado
  (`isSameCalendarMonth`, `isPendingInventoryCount`) con su pantalla.
- "Caja actual" deja de ser un valor fijo (RD$6,020 / "Rosa P."): lee la sesión
  REAL con `useCurrentCashSession` y recalcula el efectivo esperado con la misma
  función pura que `/caja` (`computeShiftDetail`).

`StatCard` gana props opcionales `href` y `ariaLabel` (retrocompatible: sin
`href` sigue siendo una tarjeta estática). Las pantallas destino leen sus
filtros por query param (`useSearchParams` + `Suspense`). **No toca DGII real.**

## [0.52.0] - 2026-07-09

**Comisión ventas Fase 2: persistencia compartida en Supabase.** Reglas,
exclusiones, estado de pago, lotes y auditoría dejan de vivir en `localStorage`
(por dispositivo) y pasan a Supabase con RLS por `business_id` — se comparten
entre dispositivos y usuarios. No cambia el motor de cálculo ni el resultado
(Pantalla = Excel = PDF) y **no toca DGII real**.

### Added
- **Migración `0023_commission.sql`** aplicada: 5 tablas nuevas
  (`sales_commission_rules`, `commission_exclusions`, `commission_payment_batches`,
  `commission_payouts`, `commission_audit`) con RLS por `business_id`
  (`auth_business_id()`). Aditiva e idempotente.
- **Rutas API `app/api/commission/*`** (`rules`, `exclusions`, `payouts`,
  `batches`, `audit`): `business_id` derivado del JWT vía `getRepoContext()`
  (nunca del cliente) + RLS. Repositorio `server/repositories/supabase/commission.ts`.
  Crear un lote orquesta lote + pagos + auditoría server-side en una sola llamada.

### Changed
- Los 5 stores (`commission-*-store`) leen/escriben vía las rutas API cuando
  `NEXT_PUBLIC_DATA_SOURCE=supabase`, con **localStorage como fallback** (modo
  demo) y último-dato-bueno ante fallos de red. Las funciones puras
  (validate/upsert/remove/toggle/…) no cambian: el motor y sus tests intactos.
- Las reglas se **siembran** con el catálogo por defecto la primera vez que un
  negocio abre el reporte (server-side), para que comisione desde el minuto cero.

## [0.51.0] - 2026-07-09

**Comisión ventas: aprobación, pago, lotes y auditoría (§12/§13/§15).** Cierra el
flujo del reporte: seleccionar comisiones pendientes, aprobarlas, marcarlas
pagadas, crear lotes de pago y ver la bitácora. No toca DGII real ni datos.

### Added
- **Estado de pago real** (`commission-payout-store`, localStorage): las KPIs
  "Pagada"/"Pendiente" y el estado por fila (Pendiente/Aprobada/Pagada) ahora
  reflejan lo que se aprobó/pagó. El motor recibe el `payoutByComprobante` — misma
  capa central (Pantalla = Excel = PDF).
- **Selección múltiple** en el detalle (solo ADMIN): checkbox por comisión
  comisionable + "seleccionar todo" de la página. Barra de acciones con
  **Aprobar**, **Marcar pagadas** y **Crear lote de pago** (usa el período/vendedor
  del filtro).
- **Lotes de pago** (`commission-batch-store`): crear un lote marca sus comisiones
  como pagadas y lo registra. **Auditoría** (`commission-audit-store`): aprobó/pagó/
  excluyó/lote con usuario, fecha, monto y motivo.
- **Modal "Pagos y auditoría"**: lista los lotes (período, vendedor, #comisiones,
  total) y la bitácora completa.
- Tests: stores puros (payout/batch/audit) + integración con el motor (marcar
  pagada mueve la comisión a "Pagada"; aprobar cuenta como pendiente de pago).

### Notes
- Persistencia por dispositivo (localStorage), como el resto de la config de
  comisiones. Migrar el libro de pagos a Supabase (`commission_payouts`,
  `commission_payment_batches`, `commission_audit`) es la Fase 2 recomendada para
  compartir/auditar los pagos entre equipos; la API de los stores ya está lista.
- Devoluciones (§14): una venta anulada/devuelta ya aparece como "Anulada"
  (comisión 0); el ajuste proporcional de devoluciones parciales queda para Fase 2.

## [0.50.0] - 2026-07-09

**Comisión ventas: exclusiones manuales.** Completa la parte del análisis del Excel
de referencia que tenía 13 ventas excluidas a mano. Ahora se puede excluir una
venta concreta de la comisión (con motivo) y volver a incluirla. No toca DGII real,
ni la venta ni sus pagos.

### Added
- **Store de exclusiones** `commission-exclusions-store.ts` (localStorage, helpers
  puros `validate/add/remove/isExcluded` + hook `useCommissionExclusions`).
  Persistencia por número de comprobante + motivo + usuario; API lista para migrar
  a `commission_exclusions` (Fase 2).
- **Acciones en la tabla de detalle** (solo ADMIN): botón **Excluir** (pide motivo)
  en ventas comisionables e **Incluir** en las excluidas manualmente. La venta
  excluida deja de sumar al instante; los KPIs, desgloses, Excel y PDF se recalculan.
- El **motivo** de la exclusión aparece en la columna "Regla" (pantalla + Excel,
  hojas Detalle y Excluidas) como `Exclusión manual: <motivo>`.
- Motor: `commissionForSale`/`buildCommissionReport` aceptan `exclusionReasons`
  para propagar el motivo sin recalcular de dos formas (Pantalla = Excel = PDF).
- Tests: store (validación, alta/reemplazo por comprobante, borrado) + integración
  con el motor (excluir una venta la marca "Excluida" y no suma).

## [0.49.0] - 2026-07-09

**Comisión ventas: reglas editables y agregables desde la UI.** Antes las reglas
(3% efectivo/transferencia, 1% tarjeta) eran configuración fija; ahora se pueden
crear, editar, activar/desactivar y eliminar desde el reporte. No toca DGII real
ni datos.

### Added
- **Store de reglas editable** `commission-rules-store.ts` (persistencia en
  localStorage, sembrado con las reglas de referencia; helpers puros
  `validateRule`/`upsertRule`/`removeRule`/`toggleRuleIn` + hook
  `useCommissionRules`). API estable para migrar luego a la tabla
  `sales_commission_rules` (Fase 2) sin tocar los llamadores.
- **Modal "Gestionar reglas"** en `/reportes/comision-ventas`: lista las reglas
  (nombre, %, métodos, sucursal, prioridad, estado), permite **Agregar** (nombre,
  porcentaje 0–100, métodos de pago, sucursal opcional, prioridad, vigencia,
  activa), **Editar**, **Activar/Desactivar**, **Eliminar** y **Restablecer** a las
  de referencia. Validación con mensajes claros. Solo ADMIN modifica
  (`commission.manage`); los demás pueden verlas.
- El reporte (pantalla + Excel + PDF) ahora **recalcula con las reglas vigentes**
  del store; el filtro "Regla de comisión" se llena dinámicamente.
- Tests: store (validación, alta/edición/borrado/toggle, `paymentGroups` vacío =
  cualquier método) + **integración con el motor** (editar la tasa cambia el
  cálculo; desactivar una regla la excluye; una regla nueva de mayor prioridad
  gana).

## [0.48.0] - 2026-07-09

**Reportes → Comisión ventas.** Nuevo reporte profesional que calcula comisiones
sobre las ventas reales de DermaLand, con la lógica derivada del Excel de
referencia `COMISION VENTAS MAYO 2026 - CUTIS.xlsx`. No toca DGII real, ni pagos ni
facturas históricas (solo lee y agrega).

### Added
- **Reglas analizadas y documentadas** en `docs/reports/COMISION_VENTAS_RULES.md`
  (análisis programático de las 222 filas): base = subtotal − descuento (antes de
  ITBIS), **Efectivo/Transferencia → 3%**, **Tarjeta (crédito) → 1%**, el ITBIS
  nunca comisiona, y **13 exclusiones manuales** (no derivables por fórmula).
- **Motor puro central** `features/reports/commission/commission-engine.ts`
  (única fuente de cálculo → Pantalla = Excel = PDF): `commissionForSale`,
  `buildCommissionReport` (KPIs + por vendedor/método/sucursal), exclusión manual,
  ventas anuladas y sin-regla. Reglas **configurables** (`commission-rules.ts`,
  default = Excel) — nada hardcodeado en la página. Reutiliza el catálogo canónico
  de métodos de pago (`paymentMethodGroup`).
- **Página `/reportes/comision-ventas`**: accesos rápidos (Hoy…Todo), filtros
  (sucursal, vendedor, cajero, método, estado de venta, estado de comisión, regla,
  cliente, número de comprobante), 8 KPIs, **Comisión por vendedor / por método /
  por sucursal**, tabla detallada con paginación (25/50/100) y orden. Ítem de menú
  "Comisión ventas" + tarjeta en el hub de Reportes.
- **Excel profesional** (9 hojas: Resumen, Detalle, Por vendedor, Por método, Por
  sucursal, Pendientes, Pagadas, Excluidas, Ajustes) compatible con el archivo de
  referencia; **PDF profesional** (KPIs + detalle + resumen por vendedor y método,
  motor central sin páginas en blanco).
- **Permisos** `commission_report.view/export` y `commission.manage` (Fase 2) en
  `features/billing/permissions.ts`; RLS por `business_id` desde la sesión.
- Tests: motor (§26: base pre-ITBIS, descuento reduce base, ITBIS no comisiona,
  3%/1%, excluida/anulada/sin-regla no suman, vendedor≠cajero, agrupaciones) +
  Excel/PDF (9 hojas, columnas de referencia, **Pantalla = Excel = PDF**).

### Notes
- **Vendedor ≠ cajero**: el reporte agrupa por vendedor (`sellerId`); ventas sin
  vendedor → "No asignado" (con filtro dedicado).
- **Fase 2 (requiere migraciones Supabase):** aprobar/pagar comisión, lotes de pago
  (`commission_payment_batches`), reglas/exclusiones editables por UI
  (`sales_commission_rules`), auditoría persistida y ajustes por devolución. El
  motor ya recibe reglas/exclusiones/estados como parámetros para conectarlos sin
  reescribir el cálculo. Todas las comisiones se muestran como **Pendientes** hasta
  que exista esa persistencia.

## [0.47.0] - 2026-07-09

**Buscador global del header, funcional de verdad.** La barra superior era un
`<input>` decorativo (sin estado, sin handler, sin navegación) y solo visible en
pantallas grandes. Ahora busca en todo el negocio y abre los resultados. No toca
DGII real ni datos.

### Added
- **Endpoint `GET /api/search?q=`** — `business_id` derivado del JWT (nunca del
  query string); RLS + filtro explícito por negocio. Devuelve resultados tipados
  y agrupados. Acepta `perGroup` (1..50) para "Ver todos".
- **`SearchRepository`** (contrato + impl Supabase + impl mock). La Supabase corre
  consultas **acotadas, en paralelo y proyectando solo columnas necesarias**
  (nombre/SKU/código de barra/marca/categoría/laboratorio para productos; nombre/
  teléfono/WhatsApp/cédula-RNC/email/código para clientes; NCF/e-NCF/cliente para
  documentos; número de lote/producto para lotes). Cada sub-consulta degrada a
  vacío si falla (una entidad nunca rompe el buscador). Stock por producto en una
  sola consulta agregada (sin N+1).
- **Núcleo puro** `features/search/`: `search-core` (normalización teléfono/cédula
  por dígitos, patrón ILIKE tolerante a separadores `%8%2%9%…`, clasificación de
  consulta, rutas de resultados, agrupación/límite), `search-match` (coincidencia
  en memoria + constructores de item compartidos con el repo Supabase → el display
  probado es idéntico al de producción).
- **UI del buscador** (`global-search.tsx`): dropdown agrupado por tipo, resultados
  clicables que navegan a la ruta real (`/productos/[id]`, `/clientes/[id]`,
  `/ventas/[id]`, `/proformas/[id]`, lote → detalle del producto), **teclado**
  (↑/↓/Enter/Escape), estados vacío/buscando/sin-resultados/error (mensajes
  amigables, **sin PGRST/SQL/UUID/stack**), y debounce de 300 ms con cancelación
  del fetch anterior.
- **Móvil**: icono lupa en el header que abre un **panel de búsqueda a pantalla
  completa** (input grande, resultados en lista, sin scroll horizontal).
- **Página `/buscar`** ("Ver todos los resultados") con los resultados completos.
- Tests: `search-core` (21), `search-match` (§16 productos/clientes/documentos/
  lotes, normalización, sin-UUID), `global-search` (input, debounce, teclado,
  click, error, sin-resultados), integración mock (aislamiento por negocio §20).

### Fixed
- **La barra de búsqueda del header no hacía nada** (input estático) y estaba
  oculta en móvil/tablet. Ahora es un buscador global real en todas las pantallas.

### Notes
- Normalización: `829-714-1975` ≡ `8297141975` y `031-0327428-2` ≡ `03103274282`
  (se comparan por dígitos, tolerando separadores, sin columnas normalizadas ni
  DDL en Supabase).
- Global ≠ filtro local: los buscadores internos de Productos/Clientes/Inventario/
  Reportes siguen siendo filtros del módulo.

## [0.46.0] - 2026-07-08

**Productos → Crear / Editar: precio de venta automático por costo + ITBIS + margen.**
La sección "Precio y costo" se reordena a **Costo → ITBIS → Margen → Precio** y el
precio se calcula solo. No toca DGII real. Motor de cálculo puro y probado.

### Added
- **Motor de precios puro** `features/products/pricing.ts` (sin React, testeable):
  fórmula de negocio `precio = costo × (1 + itbis) × (1 + margen)`, margen real,
  utilidad, redondeo comercial (2 decimales / entero / múltiplo de 5 / de 10),
  validaciones (`isValidCost` / `isValidMargin` / `isValidItbis`) y permiso
  `canOverrideSalePrice` (solo ADMIN). 28 tests (`pricing.test.ts`).
- **Sección "Precio y costo" reordenada y automatizada** (`product-form.tsx`):
  1) Costo por unidad (DOP) * · 2) ITBIS (%) * · 3) Margen (%) * (default 30, con
  botón "Editar margen" + modal "Definir margen") · 4) Precio de venta (readonly,
  calculado). Recalcula en vivo al cambiar costo, ITBIS o margen. **Preview del
  cálculo** (desglose costo → +ITBIS → costo con ITBIS → +margen → precio sugerido)
  y **margen real**. Una columna en móvil, cuatro en escritorio.
- **Override manual de precio (ADMIN)**: checkbox "Fijar precio manual", badge
  "Precio manual", motivo obligatorio y **bitácora** en
  `features/products/price-override-audit.ts` (quién, sugerido vs manual, margen
  real, motivo). Mismo patrón que `laboratory-audit`.
- **Alerta de cambio de costo al editar** (§10): "El costo cambió. Revisa el margen
  y precio de venta." No modifica el precio en silencio.
- **Reportes de productos con margen**: Excel (Catálogo con costo, ITBIS, costo con
  ITBIS, precio, **margen real** y **utilidad estimada**), PDF (costo/ITBIS/precio/
  margen real) y pantalla (nueva sección "Márgenes por producto" + botón Exportar PDF).
  Detalle de producto muestra "Costo / Margen real".
- Tests: `product-form.pricing.test.tsx` (orden visual, default 30, recálculo,
  readonly, override) y `products-report-excel.test.ts` (columnas y valores de margen).

### Fixed
- **ITBIS en el Excel de productos mostraba 1800%** (se pasaba `18` a un formato
  `percent` que espera 0-1). Ahora `itbisRate/100` → 18.00%. Igual en el PDF.

### Changed
- El **margen no se persiste** como columna aparte: el precio de venta es la fuente
  de verdad y el margen se **deriva** de `precio / (costo × (1+ITBIS)) − 1` al editar,
  evitando deriva entre dos campos. `products.cost`, `products.itbis_rate` y
  `products.price` (columnas existentes) siguen siendo lo que se guarda.
- El **costo por unidad ahora es obligatorio** en el formulario (lo exige el cálculo
  del precio). Los caminos programáticos (import) siguen tolerando costo 0.

## [0.45.1] - 2026-07-08

Corrección de raíz: **los PDF de reportes generaban páginas en blanco** y tablas
infladas. Verificado visual y programáticamente: 0 páginas en blanco. No toca
DGII real ni datos.

### Fixed
- **Páginas en blanco en TODOS los PDF de reportes** (`server/services/reports/report-pdf.ts`,
  motor central que usan los 6 reportes). Dos causas de raíz:
  1. **Footer dibujado FUERA del margen** (`y = pageH - MARGIN + 4`, por debajo
     del maxY de pdfkit): cada `text()` del footer disparaba la auto-paginación
     de pdfkit (`_text → LineWrapper → continueOnNewPage`) creando **3 páginas
     en blanco por reporte**, constante — incluso con 0 filas (0 filas producían
     4 páginas). Ahora el footer se dibuja DENTRO de la banda reservada
     `[bottom, pageH-MARGIN]`, sobre el maxY → nunca se crea una página extra.
  2. **Doble avance del cursor por fila**: `doc.text(x,y,…)` ya movía `doc.y`
     (+13.8) y además se sumaba `doc.y += rowH` (+18) → ~1.77× de espacio por
     fila, inflando cada tabla ~2× (80 filas = 24 páginas). Ahora `drawRow` fija
     `doc.y = y + rowH` (avance ÚNICO y determinista).
- **Gestor de paginación centralizado**: `ensureSpace(requiredHeight)` +
  `remainingHeight()` — REGLA: nunca se crea una página sin contenido real que
  dibujar después (el salto ocurre ANTES de la fila/sección y repite el
  encabezado de la tabla). El título de sección se mantiene junto al inicio de su
  tabla (no queda un título solo al pie con la tabla en otra página).
- **Fila TOTAL legible**: la etiqueta "TOTAL" va en la primera columna de TEXTO
  (ya no forzada en la columna de índice angosta, donde se truncaba a "TOT"); las
  columnas de índice quedan vacías en la fila TOTAL. El monto sigue visible.

### Tests
- `report-pdf.test.ts`: 11 pruebas con **detector de páginas en blanco**
  (descomprime el content stream de cada página y verifica operadores de texto
  reales) + conteos por caso: 0 filas → 1 pág, página exacta → 1 (no deja pág. 2
  vacía), +1 fila → 2, 200 filas multipágina sin blancas, TOTAL sin página
  vacía, portrait y landscape, multi-sección. Resultado antes→después: 0 filas
  4→1, 80 filas 24→3, 200 filas 52→6; **0 páginas en blanco**.

## [0.45.0] - 2026-07-07

Exportación a **PDF profesional** en TODOS los reportes con datos (paralela al
Excel de v0.44.0) + corrección de una regla de `.gitignore` que ocultaba de git
código fuente REQUERIDO. No toca DGII real ni datos.

### Fixed
- **`.gitignore` regla `reports/` (sin anclar) excluía código fuente de git**:
  `apps/web/src/lib/reports/excel/*` (motor ExcelJS que v0.44.0 necesita),
  `lib/reports/pdf/*`, `app/api/reports/*` y `server/services/reports/*`. Como no
  estaban versionados, **todo deploy por integración GitHub quedaba en ERROR** y
  solo funcionaban los deploy por CLI (que suben el working dir completo).
  Anclada a `/reports/` (solo el dir de salida en la raíz) y **se versionan los
  9 archivos fuente** → git/Vercel-Git ya pueden construir.
- **Build roto por WIP PDF** (`report-pdf.ts:67`, TS2358): rama
  `v instanceof Date` inalcanzable sobre un primitivo (`PdfCellValue` no incluye
  `Date`). `toDate` ahora solo parsea strings ISO; null/undefined/number → null.

### Added
- **Motor central PDF** `server/services/reports/report-pdf.ts` (pdfkit,
  server-only): toma un `ReportPdfSpec` (mismos datos/filtros que la pantalla y
  que el Excel) y renderiza un PDF con identidad DermaLand — encabezado
  (título + período/sucursal), KPI cards, tablas teal `#00685F` con fila TOTAL
  resaltada, auto-paginación con encabezado repetido y footer "Página X de Y".
  No imprime UUIDs. Formatos currency RD$/int/decimal/percent/date/datetime.
- **Endpoint** `POST /api/reports/pdf` (`runtime = "nodejs"`, `force-dynamic`),
  con **sesión requerida** (401 si anónimo); devuelve `application/pdf` como
  adjunto. El spec solo contiene datos ya visibles al usuario (RLS), no cruza
  negocios.
- **Botón central** `ExportPdfButton` (`components/reporting/`) en las 6
  pantallas de Reportes: evalúa el spec AL CLICK (refleja filtros vigentes),
  genera PDF REAL server-side (no `window.print`), estados Generando/OK/error.
- **Spec builders PUROS** por reporte (mismos datos que pantalla y Excel):
  Ventas, Caja, Clientes, Conteos, Inventario, Productos (`features/*/*-report-pdf.ts`).
- **Helpers** `lib/reports/pdf/` (`types`, `meta`, `filename`).
- **Config**: `pdfkit` en `serverExternalPackages` para que sus fuentes `.afm`
  viajen al lambda (verificado: render OK).

## [0.44.1] - 2026-07-07

Corrección de raíz: **editar un producto fallaba con "Ya existe otro producto
con SKU DERM-000201"** aunque se estuviera editando ese mismo producto. No toca
DGII real, secuencias fiscales ni datos.

### Fixed
- **Falso duplicado de SKU al editar producto** (`features/products/product-form.tsx`).
  Causa raíz: el pre-chequeo de unicidad en el cliente comparaba contra
  `listAllProducts()` (seed mock + localStorage), pero la app corre en modo
  `PRODUCT_BACKEND="supabase"` (`NEXT_PUBLIC_DATA_SOURCE=supabase`). El producto
  editado llega de Supabase con `id` UUID, mientras el catálogo mock tiene el
  MISMO producto con otro id (p. ej. ISDIN Fusion Water = `prod_isd_005`), así
  que la exclusión `p.id !== product.id` nunca coincidía con el gemelo mock y
  reportaba un duplicado inexistente en CADA edición. El SKU además es `readonly`:
  al editar nunca cambia, por lo que ese chequeo de cliente jamás podía atrapar
  una colisión real.
- La unicidad de SKU ahora se delega al servidor en modo supabase (índice único
  `(business_id, sku)` + reintento 23505 en `product.create`; `product.update`
  actúa sobre la misma fila por `id`, sin colisión). El pre-chequeo de cliente
  solo aplica en modo `local`, donde los ids sí coinciden.

### Added
- Helper puro y testeable `skuTakenOnEdit(...)` en
  `features/products/product-form-validation.ts` (excluye el id actual; `false`
  en modo supabase) + 5 pruebas que reproducen el escenario del bug.

## [0.44.0] - 2026-07-06

Exportación a Excel profesional (.xlsx real) en TODOS los reportes con datos:
Ventas, Inventario, Caja, Clientes, Conteos y Productos. Sistema central
reutilizable con ExcelJS + identidad DermaLand. No toca DGII real ni datos.

### Added
- **Motor central** `lib/reports/excel/` (ExcelJS, .xlsx real — nunca CSV/HTML
  renombrado): `buildProfessionalWorkbook`, `exportProfessionalWorkbook`
  (dynamic import, no engorda el bundle), `reportFileName`. Cada hoja lleva
  encabezado corporativo (DermaLand + título + Rango/Sucursal/Filtros/Generado
  por/fecha), KPIs, tablas con encabezado teal `#00685F` texto blanco, filas
  alternas, bordes suaves, **AutoFilter**, **freeze panes**, fila TOTAL
  destacada. Formatos: RD$ `"RD$"#,##0.00`, enteros `#,##0`, `0.00%`,
  `dd/mm/yyyy`, `dd/mm/yyyy hh:mm AM/PM` (montos/fechas SIEMPRE numéricos, nunca
  texto). Helper `toExcelDate` conserva la hora de pared RD.
- **Botón central** `ExportExcelButton` en todas las pantallas de Reportes con
  datos: estados "Generando Excel…" → "Excel generado correctamente." / error
  amigable. El spec se evalúa AL CLICK → refleja exactamente los filtros
  vigentes.
- **Spec builders PUROS** (testeables, mismos datos/filtros que pantalla):
  - Ventas `sales-report-excel.ts` — 8 hojas (Resumen, Ventas detalle **con
    Vendedor**, Métodos de pago, Por cajero, Por vendedor, Por sucursal,
    Productos vendidos, Clientes). `SalesTableRow.seller` agregado.
  - Inventario `inventory-report-excel.ts` — 8 hojas (Resumen, Stock actual,
    Stock por lote, Vencimientos, Bajo stock, Movimientos, Cuarentena, Recall).
  - Caja `cash-report-excel.ts` — 3 hojas (Resumen con ventas por método,
    Sesiones con base/esperado/contado/diferencia, Diferencias).
  - Clientes `customers-report-excel.ts` — 6 hojas usando la MISMA capa
    `customer-metrics` que el perfil (paridad garantizada).
  - Conteos `counts-report-excel.ts` — 5 hojas (Resumen, Conteos, Diferencias,
    No encontrados, Detalle).
  - Productos `products-report-excel.ts` — 7 hojas (Resumen, Catálogo con
    marca/categoría/lab/margen, Ventas por producto, Baja rotación, Marcas,
    Categorías, Laboratorios).
- Reportes que ya exportaban Excel (Incentivos, Laboratorios, Inventario
  físico operativo) se conservan.

### Notes
- RLS/seguridad: los datos salen de los mismos hooks/APIs con `business_id` de
  la sesión — el Excel nunca cruza negocios. Sin UUIDs/tokens/secretos en el
  archivo (test guardián).
- Tests: paridad pantalla↔Excel (KPIs, totales, ITBIS, métodos, filtros
  fecha/sucursal/método/vendedor/cliente/producto) + round-trip que re-abre el
  .xlsx con ExcelJS (archivo válido) + formatos numéricos/fechas/AutoFilter/
  freeze + sin UUIDs.

## [0.43.0] - 2026-07-06

Revisión TOTAL del módulo de Clientes: elimina el falso "Cliente no
encontrado" (race de carga), unifica perfil/listado/reporte en UNA capa de
métricas, filtra las compras por cliente en el servidor (rendimiento) y
agrega auditoría/backfill seguro de relaciones cliente↔ventas. Migración
`0022_customer_sales_relations.sql` (aditiva) APLICADA a cloud. No toca
DGII real ni datos.

### Fixed
- **Falso "Cliente no encontrado" con UUID al abrir un perfil**: en modo
  supabase `useCustomer` devolvía `undefined` mientras el fetch estaba en
  vuelo y la página lo trataba como not-found. Ahora `useCustomerProfile`
  expone estados explícitos `loading / notFound / error` — skeleton
  profesional durante la carga, "No encontramos este cliente." (sin UUID)
  solo cuando la consulta TERMINÓ, error de red con botón Reintentar.
- **Reporte de Clientes en RD$0.00 / 0 compras**: el reporte y el listado
  leían `clients.total_spent/total_orders/last_visit_at` — columnas
  estáticas que ninguna venta actualiza. Ahora TODAS las pantallas
  calculan desde las ventas reales con la misma capa del perfil
  (caso de regresión WILLIAN CLI-420678: 16 compras / RD$34,908 en
  perfil, listado y reporte por igual).

### Added
- **Capa central de métricas** `features/customers/customer-metrics.ts` +
  `customer-purchases.ts` ampliado: `isFinalCustomerTransaction()`,
  `collectConvertedSourceIds()`, `computeCustomersReport()` (agrupación
  O(N+M) sin N+1), `computeCustomersReportKpis()`, `isVipCustomer()` con
  regla VIP configurable central, `avgTicket`, filtros período/sucursal
  (`filterSalesForPeriod`). Estado `voided` excluido.
- **Anti doble conteo proforma→factura**: columna `proformas.
  source_proforma_id` (mig 0022) + tipo `sourceProformaId`. Una proforma
  referenciada por una factura final no suma dos veces en gasto/compras
  (perfil, reporte de clientes y topCustomers del reporte de ventas).
- **API por cliente**: `GET /api/customers/[id]` (404 real),
  `GET /api/customers/[id]/purchases` (ventas del cliente filtradas en
  SERVIDOR con fallback legacy doc/teléfono; ítems/pagos solo de esas
  ventas), `GET /api/customers/metrics` (agregado liviano de cabeceras
  para reporte/listado — 2 queries, sin N+1).
- **Reporte de Clientes**: filtros (fechas, sucursal, cliente, tipo de
  piel, segmento, compras mínimas, gasto mínimo — KPIs y tabla comparten
  el MISMO conjunto), columna Ticket promedio y Segmento, acciones con
  íconos (Ver cliente / WhatsApp / Correo / Ver compras), skeleton y
  estado de error con Reintentar.
- **Normalización canónica** `customer-normalization.ts` (documento
  alfanumérico mayúsculas — pasaportes ya no colisionan por dígitos,
  teléfono sin prefijo país, email lowercase) — compartida por matching,
  detección de duplicados y scripts.
- **Scripts seguros**: `scripts/audit-customer-sales-relations.mjs`
  (auditoría solo-lectura → `data/customer-relations-audit.json`) y
  `scripts/backfill-customer-relations-safe.mjs` (dry-run default,
  `--apply`, `--link-conversions` solo pares 1:1 inequívocos, log de
  auditoría persistente; nunca borra).
- **Índices** (mig 0022): `proformas(business_id, customer_id,
  created_at desc)`, `proformas(business_id, created_at desc)`, parcial
  sobre `source_proforma_id`.
- `Skeleton` UI primitive (`components/ui/skeleton.tsx`).

### Changed
- Perfil/listado/reporte se invalidan al crear/editar/anular ventas o
  clientes (eventos compartidos `CUSTOMERS_CHANGE_EVENT` /
  `PROFORMAS_CHANGE_EVENT` + `storage`) — sin cachés divergentes.
- El perfil ya NO descarga todas las ventas del negocio (antes
  `/api/proformas` completo: 691 ms / 23 KB con apenas 16 ventas y
  crecimiento lineal): pide su cliente + sus compras en paralelo.

### Auditoría de datos (2026-07-06)
- 1 cliente, 16 ventas, TODAS con `customer_id` (0 huérfanas, 0 sin
  cliente). 3 posibles dobles conteos proforma↔factura AMBIGUOS
  (PROF-2026-28372, PROF-2026-89148, PROF-2026-89236) — requieren
  decisión manual; el backfill seguro no los enlaza por regla.

## [0.42.0] - 2026-07-04

Alta de personal/vendedores cableada a Supabase (cierra el gap del selector
de vendedor: ya se pueden registrar vendedores reales). Migración
`0021_users_vendedor_role.sql` aplicada. No toca DGII real.

### Added
- **Rol `vendedor`**: nuevo rol en `users` (mig 0021 amplía el CHECK) + en
  `UserRole`/`roleDefinitions`/`roleBadgeTone`. `users.id` ahora tiene default
  `gen_random_uuid()` para registrar personal sin cuenta de login.
- **Crear/editar personal desde la app** (antes la pantalla era demo mock):
  - `POST /api/users` (crea registro de personal; solo admin/manager; valida
    email único, rol; business_id de la sesión) y `PATCH /api/users/[id]`
    (editar nombre/rol/sucursales/estado). Auditoría en `audit_logs`.
  - `features/admin/user-store.ts` (`useUsersList`, `saveUser`,
    `setUserStatus`; gate mock/supabase) + `UserModal`.
  - **Pantalla Administración → Usuarios reescrita a datos reales**
    (`useUsersList` en vez de `mockUsers`): botón "Nuevo usuario", modal
    crear/editar, activar/desactivar; el vendedor registrado aparece de
    inmediato en el selector del POS.
- Aclaración en la UI: registrar personal habilita al vendedor para POS e
  incentivos, pero **no crea una cuenta de acceso (login)** — eso es Supabase
  Auth aparte (no se manejan contraseñas desde la app).
- Verificado en vivo: crear vendedor → elegible en POS → desactivar lo
  excluye → limpieza. 6 tests nuevos (store + rol vendedor).

## [0.41.0] - 2026-07-04

Incentivos: pago, dashboard, Excel y devoluciones (Fase 3, cierra la épica).
No toca DGII real.

### Added
- **Ajuste por devolución**: al anular una venta
  (`PATCH /api/proformas/[id]` action:cancel) se anulan (status→void) sus
  incentivos pendientes/aprobados; los ya PAGADOS quedan marcados para ajuste
  manual (no se borra historial). Lógica pura `incentivesToVoidForCancelledSale`.
- **Dashboard/ranking**: KPIs (generados, pendientes, pagados, vendedor top,
  ventas incentivadas, promedio por venta) + tabla ranking por vendedor
  (ventas, generado, pagado, pendiente). Agregación pura `incentive-report.ts`.
- **Excel de 6 hojas** (`incentive-export.ts`, on-demand): Resumen, Por
  vendedor, Detalle por venta (Fecha/Factura/Sucursal/Vendedor/Cajero/Cliente/
  Regla/Tipo/Base/Incentivo/Estado/Fecha pago), Detalle por producto, Pagados,
  Pendientes. Endpoint de incentivos enriquecido con cajero/cliente/sucursal.
- **Permisos**: `canManageIncentiveRules` (admin/manager), `canPayIncentives`
  (admin/super_admin), `canViewIncentives`. La UI oculta "Nueva regla" y el
  pago según rol.
- 7 tests nuevos (ranking, summary, Excel 6 hojas). Total incentivos: 25 tests.

### Épica de incentivos — completa
Vendedor en venta (0.39.0) → motor + reglas + generación (0.40.0) → pago +
dashboard + Excel + devoluciones (0.41.0).

## [0.40.0] - 2026-07-04

Motor de incentivos por vendedor (Fase 2 de la épica). Migración
`0020_sales_incentives.sql` aplicada. No toca DGII real.

### Added
- **Motor de cálculo de incentivos PURO** (`incentive-engine.ts`, 18 tests):
  6 tipos de regla — monto fijo por producto, % sobre venta, % sobre margen,
  por laboratorio, por categoría, por meta. Base = **venta neta sin ITBIS**
  después de descuentos; margen = neto − costo×cantidad. Resultado es un
  SNAPSHOT: reglas futuras NO alteran incentivos ya generados. Respeta
  vigencia por fechas; sin vendedor o venta no pagada → no genera.
- **Tablas** `sales_incentive_rules` (reglas configurables) y
  `sales_incentives` (snapshot, estados pending/approved/paid/void), RLS por
  business, unique(sale_id, rule_id, product_id) para generación idempotente.
- **Endpoints** (sesión + RLS): `GET/POST /api/incentives/rules`,
  `PATCH/DELETE /api/incentives/rules/[id]`, `GET /api/incentives` (filtros
  vendedor/estado/fecha, con nº de factura), `POST /api/incentives/generate`
  (idempotente, corre el motor server-side), `POST /api/incentives/pay`
  (lote pagado con payment_batch_id). Auditoría en `audit_logs`.
- **Generación automática**: al completar una venta con vendedor en el POS
  (modo supabase) se dispara `/api/incentives/generate` (fire-and-forget, no
  bloquea la venta).
- **Pantalla `/ventas/incentivos`**: KPIs (generados/pendientes/pagados/reglas
  activas), tabla de reglas + modal crear/editar/activar/eliminar, tabla de
  incentivos generados con filtro por vendedor/estado y acción "Marcar como
  pagado". Entrada en el menú Ventas.
- Verificado en vivo contra la DB: regla 5% → snapshot RD$137.29 sobre neto
  2745.76 de la factura E3200000095 → marcado pagado → limpieza.
- Devoluciones (ajuste de incentivo), dashboard/ranking y Excel 6 hojas son
  la Fase 3 siguiente.

## [0.39.0] - 2026-07-04

Base para incentivos/comisiones por vendedor (Fase 1 de la épica).
Migración `0019_sale_seller.sql` aplicada. No toca DGII real.

### Added
- **Vendedor responsable de la venta**, separado del cajero:
  - **POS**: selector obligatorio "Vendedor *" (combobox buscable
    `SellerSelect`) en la columna Venta actual, entre cliente y tipo de
    facturación. Lista los usuarios activos con rol que puede vender
    (admin/manager/cashier/supervisor + roles de venta) de la sucursal
    activa; al cambiar de sucursal se refresca y limpia la selección si el
    vendedor ya no pertenece. No permite cobrar sin vendedor.
  - **Persistencia**: la venta guarda `seller_id` (FK users, relación por id)
    + `seller_name` (snapshot para historial). Columnas nuevas en `proformas`
    (mig 0019) + mapeo en repo/tipos.
  - **Fuente de vendedores**: `GET /api/users` (RLS por business) +
    `useSellers(branchId)` con reglas puras testeadas (`seller-store`).
  - **Ventas/Facturas**: columna Vendedor ("No asignado" en ventas viejas) +
    filtro por vendedor.
  - **Detalle de venta**: muestra Cajero y Vendedor separados.
  - **Reporte de ventas**: filtro por vendedor + sección "Ventas por
    vendedor" (ventas, total, ticket promedio) + hoja "Por vendedor" en el
    Excel. `bySeller` y filtro `sellerId` en la lógica pura.
- Ventas previas sin vendedor se muestran como "No asignado" (no se inventa
  vendedor). Los incentivos (reglas, generación, pago, dashboard, Excel,
  devoluciones) son las Fases 2-3 siguientes de esta épica.

## [0.38.2] - 2026-07-04

### Fixed
- **Auditoría y corrección de pantallas que leían seeds `mock*`
  transaccionales como si fueran datos reales** (misma causa raíz de v0.18
  Laboratorios y v0.38.1 perfil de cliente). Un barrido de las 56 páginas que
  importan `@/lib/mock-data` encontró 4 bugs de alto impacto:
  - **Dashboard raíz** (`page.tsx`): KPIs y listados leían
    `mockProformas/mockProductLots/mockProducts/mockCustomers` → cifras fijas.
    Ahora usa `useProformas/useAllLots/useProducts/useCustomers`. Además:
    "Ventas hoy" ahora filtra el DÍA (antes sumaba TODAS las proformas),
    "Clientes nuevos" usa el mes actual (antes Mayo 2026 hardcodeado) y
    "Productos en catálogo" muestra el conteo real.
  - **Pagos** (`pagos/page.tsx`): `mockProformas` → `useProformas`; los pagos
    reales del POS no aparecían. Ruteo correcto factura/proforma
    (`documentRouteBase`) + estado vacío.
  - **Inventario > Bajo stock**: `mockProducts`+`mockProductLots` →
    `useProducts`+`useAllLots`+`totalSellableStock`; el listado de reorden
    salía vacío/incorrecto.
  - **Inventario > Recall**: `mockProductLots` → `useAllLots`; los lotes en
    recall (estado cambiado en runtime) no aparecían.
- Guardia de regresión `app/(app)/dashboard-data-source.test.ts`: falla si
  esas pantallas vuelven a importar un mock transaccional en vez del hook.
- Sin tocar los casos "borderline" que son placeholders intencionales (aún
  no existe hook Supabase): grilla e-CF en DGII, conteos, auditoría —
  quedan documentados como trabajo futuro. Catálogos estáticos (tipos de
  piel, condiciones, roles, empresa) NO se tocan: es correcto leerlos del seed.

## [0.38.1] - 2026-07-04

### Fixed
- **Perfil de cliente mostraba RD$0.00 / 0 compras aunque el cliente tuviera
  facturas pagadas.** CAUSA RAÍZ: `clientes/[id]` filtraba el seed estático
  `mockProformas` (siempre vacío para clientes reales) y los KPIs leían
  `customers.total_spent/total_orders/last_visit_at`, columnas que el POS
  nunca actualiza. Los datos en la DB estaban BIEN (las facturas sí tienen
  `customer_id`). FIX: el perfil ahora usa las ventas REALES (`useProformas`,
  Supabase o local según DATA_SOURCE) con lógica pura en
  `features/customers/customer-purchases.ts`: relación principal por
  `customer_id` + fallback seguro por documento/teléfono normalizados
  (031-0327428-2 == 03103274282; +1 829 714 1975 == 8297141975) SOLO cuando
  la venta trae ese dato — walk-ins nunca se mezclan.
- KPIs derivados de las ventas: Total gastado = Σ facturas pagadas (pago
  parcial suma lo pagado; anuladas/borradores NO cuentan), Compras = número
  de facturas pagadas, Última visita = última venta; proformas pendientes se
  listan con estado "Proforma" sin sumar.
- Pestaña Compras: columnas Fecha/Comprobante/Tipo/Items/Total/Estado +
  acciones Ver/Imprimir/WhatsApp/Correo (reusa `SendInvoiceModal`); estados
  con etiquetas amigables (sin errores técnicos ni UUIDs).
- Script `scripts/backfill-invoice-customers.mjs` (dry-run default,
  `--apply`): enlaza ventas viejas sin customer_id por documento/teléfono/
  email con reporte de ambiguas. Ejecutado contra la DB real: **0 ventas sin
  customer_id** — no hizo falta enlazar nada.
- 12 tests nuevos (normalizadores, fallback, walk-in, KPIs, anuladas).

## [0.38.0] - 2026-07-04

### Added
- **Pantalla DGII > Numeraciones portada a Supabase.** En modo supabase,
  `/dgii/secuencias` lee y administra `invoice_numberings` — la MISMA tabla
  que consume el POS al reservar (una sola fuente de verdad; ya NO usa
  localStorage). En modo mock sigue el store local como demo.
- Endpoints seguros (sesión + RLS; business_id NUNCA del cliente):
  `GET/POST /api/dgii/sequences`, `PATCH/DELETE /api/dgii/sequences/[id]`,
  `POST .../prefer|activate|deactivate`, `GET .../history` (auditoría desde
  `audit_logs`, incluye los números reservados por el POS).
- Validaciones servidor (`features/dgii/numbering-rules.ts`, puras +
  testeadas): siguiente dentro del rango, una sola preferida activa por
  tipo+ambiente (también el índice parcial de la DB), **ambiente
  `produccion` BLOQUEADO** mientras DGII real esté apagado, en ediciones no
  se puede bajar el siguiente número ni mover/encoger el rango con
  comprobantes emitidos; eliminar = soft-delete y SOLO sin uso.
- UI: KPIs (activas, por agotarse, vencidas, fuente), filtros por
  tipo/ambiente/estado/electrónica, paginación, alerta de tipos POS sin
  preferida activa, historial en el detalle, errores amigables (sin UUIDs
  ni errores técnicos).
- Verificado EN VIVO: reserva del POS subió B02 de 1300→1301 y la pantalla
  (misma tabla) lo refleja; segunda preferida activa rechazada por la DB.

## [0.37.0] - 2026-07-03

**REQUIERE MIGRACIÓN**: `0011_invoice_numberings.sql` + `0018_pos_numbering_wiring.sql`
deben aplicarse a la DB ANTES de desplegar (sin ellas, la emisión de
B02/B01/E32/E31 en modo supabase falla con "no hay numeración"). Nada activa
DGII real — Fase G sigue bloqueada.

### Added
- **POS cableado a reserva ATÓMICA de secuencias en servidor** (Fase C).
  En modo supabase el POS reserva el comprobante vía
  `POST /api/dgii/sequences/reserve` → tabla `invoice_numberings` + RPC
  `reserve_invoice_number` (`UPDATE ... RETURNING` con lock de fila,
  RLS/`auth_business_id()`): dos cajas en dispositivos distintos JAMÁS
  reciben el mismo número. **localStorage ya NO numera comprobantes fiscales
  en modo supabase** (era por navegador → duplicados entre cajas), y si el
  servidor no puede reservar la venta se aborta con error (sin fallback
  silencioso). Proforma sigue local (no consume secuencia fiscal).
- `reserveNextPreferredAnywhere` en `numbering-store` (server en supabase /
  localStorage en mock, misma preferencia de ambiente; nunca `produccion`).
- La factura guarda la trazabilidad de la reserva: `numbering_id` +
  `sequence_environment` (columnas nuevas en `proformas`), además de
  `number`/`ecf_number`/`ecf_type`/`sequence_type`/`document_kind`/
  `billing_type` existentes. Auditoría best-effort `dgii.sequence_reserved`
  en `audit_logs` con cajero/sucursal.
- Migración `0018_pos_numbering_wiring.sql`: columnas de trazabilidad +
  seeds de numeraciones del negocio con `next_number` POR ENCIMA del máximo
  ya emitido en la DB (B02→1300 vs B0200001247 emitido; E32→150 vs
  E3200000095) para no colisionar con contadores localStorage previos.
- 9 tests nuevos del cableado (fetch correcto, sin localStorage, sin
  fallback, proforma local, nunca produccion, sin duplicados locales).

### Docs
- **`docs/dgii/QR_CONSULTA_VERIFICACION.md`** — duda D-06 CERRADA: los
  parámetros del QR implementados en v0.36.0 quedaron CONFIRMADOS contra la
  Descripción Técnica de Facturación Electrónica v1.6 (DGII) y las páginas
  vivas de consulta (`ecf.dgii.gov.do/.../ConsultaTimbre` y
  `fc.dgii.gov.do/.../ConsultaTimbreFC`). Sin cambios de código; quedan 3
  dudas menores documentadas (segmento certecf en FC, mayúsculas del path,
  URL-encoding del código) para validar en certificación.

## [0.36.0] - 2026-07-03

Correcciones al módulo DGII derivadas de la revisión fiscal completa.
**Nada de esto activa emisión real** — Fase G sigue bloqueada (killswitch
`DGII_TESTECF_SEND_ENABLED=false` + gates intactos).

### Fixed (núcleo fiscal e-CF)
- **Código de seguridad**: ahora son los **primeros 6 caracteres del
  `SignatureValue` tal cual** (base64 con `+`/`/`/`=`; solo se remueve
  whitespace de formato). Antes tomaba 8 caracteres y eliminaba los
  no-alfanuméricos ANTES de cortar → el código impreso/QR no habría
  coincidido con el que DGII recomputa.
- **QR de consulta del timbre** (`qr.ts`): se agregó **`FechaFirma`**
  (obligatoria en la consulta general), el parámetro se renombró
  `CodigoSeguridadIeCF` → **`CodigoSeguridad`**, la URL apunta a la
  **página** de consulta (no a `/api/Consulta`), y consumo (e-CF 32)
  **< RD$250,000** usa la consulta reducida
  `fc.dgii.gov.do/{amb}/ConsultaTimbreFC` sin comprador ni fechas.
- **Zona horaria**: `formatDgiiDate`/`formatDgiiDateTime` SIEMPRE formatean
  en hora RD (**AST, UTC-4 fijo**). Antes usaban el TZ del proceso: en
  Vercel (UTC) una venta a las 22:00 se firmaba con fecha del día siguiente.
- **Totales por tasa**: los mappers (`proforma-to-input`,
  `source-invoice-to-nc`, `demo-renderer`) ahora emiten **`MontoGravadoI1/I2`
  junto a `TotalITBIS1/2`**, separan exentos en **`MontoExento`** (ya no
  inflan el gravado) y la **NC deriva la tasa de la factura origen** (antes
  hardcodeaba 18% aunque el origen fuera exento).
- **Identidad por línea**: `precioUnitarioItem` se deriva del monto de línea
  para garantizar `cantidad × precio − descuento == montoItem` tras redondeo.
- **eNCF estricto**: el builder valida `E + tipo oficial + 10 dígitos`
  (antes cualquier alfanumérico de 13 chars pasaba).

### Added
- **Validación aritmética de negocio en el builder**
  (`assertEcfArithmetic`): identidad por línea, granulares vs líneas,
  `MontoGravadoTotal ≈ ΣIi`, `TotalITBIS ≈ ΣITBISi`,
  `TotalITBISi ≈ gravado × tasa` (tolerancia ±1 por redondeo por línea) y
  `MontoTotal ≈ Σ líneas + ITBIS`. El XSD solo validaba estructura.
- **`POST /api/dgii/sequences/reserve`**: reserva **atómica** del siguiente
  número e-CF vía la RPC existente `reserve_ecf_sequence_number` (mig 0003,
  `FOR UPDATE`), multi-tenant por RLS. Base de Fase C — pendiente cablear el
  POS a este endpoint en modo supabase (hoy reserva en localStorage POR
  NAVEGADOR: dos cajas en máquinas distintas pueden repetir número; la
  limitación quedó documentada en `numbering-store.ts`).

### Fixed (gating/observabilidad)
- `/api/health` reporta `dgii` según el **sistema real de certificados**
  (Fase F, cert cifrado en Supabase) además de las envs legadas
  `DGII_CERTIFICATE_PATH/PASSWORD` (ahora marcadas deprecadas).
- **Gate por checklist** en habilitación: `postulacion`, `pruebas_ecf` y
  `declaracion_jurada` ya no aceptan `completed` forzado sin todos los
  ítems marcados (antes se podía mostrar "Certificado por DGII" sin
  sustento).
- Wipe best-effort REAL de material sensible (`.p12`): se sobreescribe el
  contenido del buffer, no solo la referencia; comentario de
  `resolveSigningMaterial` corregido (SÍ se usa en Fase F test-local).
- `document-resolver.ts` marcado **deprecado**: la fuente única de la
  decisión documental (R-FIS-01) es `features/billing/auto-billing-rules.ts`
  (lo que ejecuta el POS).
- `CantidadItem` conserva hasta 4 decimales en cantidades fraccionarias.

## [0.35.0] - 2026-07-03

### Performance
- **xlsx sale del bundle inicial (−95 kB de First Load JS en 4 rutas).** Los
  módulos de exportación a Excel (`sales-report-export`, `physical-count-export`,
  `lab-sales-export`) ahora se cargan con `await import()` al pulsar Exportar.
  Antes/después (First Load JS): `/reportes/ventas` 323→228 kB,
  `/productos/laboratorios` 316→221 kB, `/conteo-fisico` 309→213 kB,
  `/conteo-fisico/[id]/escanear` 308→212 kB.
- **Cache de lectura en stores localStorage** (`lot-store`, `product-store`,
  `proforma-store`): `listAllLots/listAllProducts/listAllProformas` re-parseaban
  y mapeaban TODO el seed en cada evento de cambio, multiplicado por cada hook
  montado. Ahora reutilizan el resultado mientras los strings crudos de
  localStorage no cambien (cubre tests y otras pestañas sin depender de eventos).
- **POS: índice de lotes por producto** (`lotsByProduct` con `useMemo`). Cada
  tarjeta hacía ~4 barridos completos del array de lotes por render
  (O(productos×lotes)); ahora consulta solo los lotes de su producto.

### Fixed
- **Productos: orden por Stock podía quedar desactualizado.** Los comparadores
  usaban un `Map` de módulo mutado durante el render que no invalidaba el memo
  de ordenamiento; ahora los comparadores se memoizan sobre el mapa de stock y
  el orden se recalcula al cambiar el inventario. Se eliminó también el listener
  redundante `useInventoryTick` (doble re-render por evento).

## [0.34.0] - 2026-07-02

### Fixed
- **URGENTE: "Producto no encontrado" después de crear un producto.** El insert
  en Supabase siempre fue correcto (id real, `business_id` correcto, activo);
  el fallo era de LECTURA: el detalle buscaba el producto dentro de
  `GET /api/products?limit=1000` ordenado por nombre, y con **1355 productos**
  todo lo que ordenara después de la posición 1000 quedaba invisible (además
  PostgREST corta cada request en 1000 filas). Un producto nuevo cuyo nombre
  caía fuera de la 1ª página "no existía" para la UI.
- La página **Productos** (y todo consumidor de `useProducts`) ahora ve el
  catálogo COMPLETO: `fetchProductsFromServer` pagina de a 1000
  (`limit`+`offset`, repos Supabase con `.range()` y mock con `slice`).
- En modo Supabase, si el fetch de lista falla ya **no** se cae al catálogo
  mock/localStorage (mostraba datos que no son de la base compartida); se
  conserva la última lista buena.

### Added
- `GET /api/products/[id]`: lectura directa por id (repo `product.byId`,
  filtrada por `business_id`, 404 si no existe).
- `fetchProductFromServer(id)` + hook `useProductState(id)` con estado
  `loading`: el detalle y la edición de producto leen por id directo (ya no
  dependen de la lista) y muestran "Cargando producto…" mientras resuelven —
  "Producto no encontrado" solo aparece cuando de verdad no existe.
- Script de diagnóstico read-only `scripts/check-product-create-read.mjs`
  (totales, gap de la 1ª página, lectura por id de los recientes,
  `--id <uuid>` para un producto puntual). Verificado contra la DB cloud:
  355 productos quedaban fuera de la página 1; el producto reportado
  (`RADIOCARE`, DERM-000001) existe, activo y legible por id.
- 9 tests nuevos (paginación, lectura por id 200/404/error, hooks). Suite 1314.

## [0.33.0] - 2026-07-02

### Added
- Edición de factura — **campos operativos pendientes**: **cajero**, **fecha de
  emisión** (solo admin), **estado** (subconjunto no fiscal: borrador / emitida /
  pagada / pago parcial) y **tipo de facturación** (consumo B02 / crédito fiscal
  B01, editable solo en documentos NO emitidos). Persisten en `updateFull`
  (Supabase + mock) con recálculo y auditoría; cambios sensibles siguen exigiendo
  motivo. +5 tests (44 del módulo de edición).

### Security / Fiscal
- Fecha de emisión y estado gateados a **admin** (servidor = fuente de verdad).
- Estados fiscales (`pending_ecf`, `converted_to_ecf`, `cancelled`, `expired`)
  **no** se fijan al editar (tienen sus propios flujos).
- **B02↔B01 bloqueado** en facturas emitidas → nota de crédito (recomendación del
  spec). NCF/número/tipo de documento siguen intactos. DGII real apagado.

## [0.32.0] - 2026-07-02

### Added
- **Edición segura de facturas** en Ventas / Facturas y en el detalle del
  documento. Nuevo botón **"Editar factura"** (detalle + tabla) y pantalla
  `/ventas/[id]/editar` con edición de cliente, teléfono, documento, notas,
  **productos, cantidades, precios, descuentos por línea, descuento global y
  pagos** (método / monto / últimos 4 / referencia).
- Motor puro `features/sales/invoice-edit.ts`: `recalcInvoice` (reusa el motor
  ITBIS-incluido `cartTotals`), `validateInvoiceDraft`, `stockDeltasForEdit`,
  `isSensitiveChange`, `diffInvoiceForAudit` (+27 tests).
- Persistencia completa: `ProformaRepository.updateFull` (Supabase + mock) que
  **recalcula los totales en el servidor** desde los ítems y reemplaza
  líneas/pagos con compensación best-effort; API `PATCH action:"update_full"`.
- **Auditoría** `sale.update_full` con diff antes/después + **motivo obligatorio**
  para cambios sensibles (ítems, precios, descuentos, total, pagos).
- **Ajuste de stock por delta** al editar (devolver/consumir por lote, FEFO al
  agregar productos), igual que el POS.

### Security / Fiscal
- e-CF real → **bloqueo total** de edición directa (camino: nota de crédito).
- NCF/número/tipo de documento **nunca** se modifican al editar.
- DGII real se mantiene apagado (`/api/health` → `dgii:false`).

## [0.22.0] - 2026-07-01

### Changed
- **Refresh del sistema de diseño (front) alineado al diseño clínico de Stitch.**
  Cambios CENTRALES que se propagan a toda la app sin reescribir pantallas:
  - **Paleta teal profunda**: `--brand-primary #00685f`, `--brand-accent #0d9488`,
    texto `--brand-fg #0b1c30` (navy), fondo `--brand-bg #f8f9ff` (superficie
    clínica). Antes era un teal más claro (#2db4a8).
  - **Tipografía**: **Inter** (UI) + **JetBrains Mono** (SKU/lotes/códigos) vía
    `next/font`, enlazadas a las utilidades `font-sans`/`font-mono` (`@theme`), así
    todos los `font-mono` existentes (SKU, comprobantes) usan JetBrains Mono.
  - **Cards**: borde `slate-200` de 1px y **sombra teal suave al hover**
    (`0 4px 16px rgba(13,148,136,0.08)`), sin sombra en reposo. Badges ya eran
    pill semánticos.

### Notes
- Fase 1 (tokens + tipografía + primitivos). El rediseño por-pantalla con las
  composiciones exactas de los mockups (POS, inventario, reportes, etc.) puede
  seguir pantalla por pantalla. `apps/web` build + 1228 tests verdes. No se tocó
  DGII ni lógica.

## [0.21.0] - 2026-07-01

### Added
- **Módulo Súper Admin ampliado y con guard de acceso.** El layout
  `(super-admin)` ahora **bloquea a usuarios normales** (solo `is_platform_admin`
  o rol `super_admin`; en modo demo se permite) con mensaje "Acceso restringido"
  en vez del panel. Helper puro `canAccessSuperAdmin` (4 tests).
- **Menú completo** en el shell + **8 pantallas nuevas** (además de las 8
  existentes): Usuarios globales (tabla + KPIs + export CSV), Roles y permisos
  (roles + catálogo por módulo), Auditoría global (eventos + export CSV), Salud
  del sistema (integraciones + presencia de variables SIN valores), Logs (estado
  vacío profesional), Seguridad (usuarios sin MFA, RLS, aviso leaked-password),
  Configuración global (ajustes de plataforma) y Herramientas (utilidades
  read-only/seguras). UI violeta reutilizable `super-admin-ui.tsx` + export CSV.

### Notes
- Nunca se expone `service_role` al cliente; no se muestran secretos, SQL, ni
  stack traces. Los datos multiempresa reales (listar todas las empresas/usuarios/
  auditoría cross-tenant) y las tablas nuevas (`platform_settings`,
  `business_modules`, `system_logs`, subscripciones) quedan como **fase servidor**
  (hoy se usa el dataset disponible con presentación profesional). No se tocó DGII.

## [0.20.0] - 2026-07-01

### Changed
- **El SKU de producto ya no es editable: lo genera el sistema, secuencial**
  (`DERM-000001`, `DERM-000002`, …, continuando desde el máximo existente). En
  Nuevo/Editar producto el campo **SKU es de solo lectura** con texto de ayuda
  ("El SKU se genera automáticamente." / en edición: "no se puede modificar…").
  El **código de barra (EAN-13) sigue siendo editable** (SKU ≠ código de barra).

### Added
- Generación **autoritativa del lado servidor** (`product.nextSku` + `create`
  regeneran y reintentan ante colisión del índice único `business_id+sku`, seguro
  ante concurrencia) — no depende de la lista cliente (limitada a 1000). Endpoint
  `GET /api/products/next-sku` para previsualizar el próximo SKU en el formulario.
  Helper puro `features/products/product-sku.ts` (`nextSkuFromSkus`, `nextSkuAfter`,
  `parseSkuNumber`, `formatSku`) + hook `useNextSku`. Script opcional
  `scripts/backfill-product-skus.mjs` (asigna SKU a productos sin SKU; idempotente).
- Al crear: toast **"Producto creado con SKU DERM-000591."**. Ante SKU duplicado
  ya no se rechaza: se **genera uno nuevo**.

### Notes
- No se cambian los SKU existentes (solo se rellenan vacíos, y `products.sku` es
  NOT NULL → normalmente 0). El índice `unique(business_id, sku)` (mig 0002) evita
  duplicados; no hizo falta tabla/RPC de secuencia. No se tocó DGII ni datos.

## [0.19.1] - 2026-07-01

### Fixed
- **Login no dejaba entrar aunque el usuario/clave fueran correctos.** La página
  `/login` llamaba a `signIn` pero **no redirigía** al éxito (era un stub), así
  que tras "Entrar" la sesión se creaba pero te quedabas en /login. Ahora
  **redirige** a `next`/`/` al éxito, **muestra el error** si las credenciales
  son inválidas, y respeta el `?next=` del middleware.
- El banner **"Modo demo activo — DATA_SOURCE=mock"** estaba **hardcodeado**
  (salía siempre, confundía en producción). Ahora solo aparece cuando el backend
  realmente está en modo mock (`env.DATA_SOURCE === "mock"` o Supabase sin
  configurar). En producción (supabase) ya no se muestra.

## [0.19.0] - 2026-07-01

### Changed
- **El laboratorio pertenece al PRODUCTO, no al lote.** En "Agregar stock al
  producto", si el producto **ya tiene laboratorio** el selector se muestra
  **bloqueado** (chip con nombre · país · tipo y candado, sin buscador, sin "+",
  sin quitar) con el texto "Este producto ya tiene laboratorio asignado. Para
  cambiarlo, edita el producto." Si NO tiene, se puede asignar una vez (buscador
  + crear) y al guardar queda en el producto — bloqueado en futuros agregados.
- **Editar producto** es el único lugar para cambiar el laboratorio: cambiarlo
  exige **confirmación** ("Confirmo cambiar el laboratorio") con advertencia de
  que afecta los reportes por laboratorio, y registra **auditoría**
  (`laboratory-audit`: producto, old/new lab, usuario, motivo, fecha).

### Added
- **Matching de laboratorios por nombre/marca** con aliases
  (`features/products/laboratory-matching.ts`): ISDIN, La Roche-Posay/lrp,
  Eucerin, Avène, Bioderma, CeraVe, A-Derma/aderma, Sesderma, Uriage, Heliocare,
  ACM, Isispharma, Ducray, Vichy, Mustela, Cetaphil, Galderma, SVR, Filorga,
  MartiDerm, Neostrata, SkinCeuticals. Elige el match más específico (evita que
  "La Roche-Posay" caiga en "Roche"). `planBackfill` (puro) + 10 tests.
- **Script `scripts/backfill-product-laboratories.mjs`** (dry-run/--apply,
  service_role, reporte + CSV de pendientes) y **migración
  `0017_backfill_product_laboratories.sql`** (idempotente, solo rellena
  `laboratory_id` NULL; nunca sobreescribe; agrega ACM/Isispharma si faltan).

### Notes
- El backfill de datos en la nube quedó **listo para aplicar** (la sesión de
  Supabase del navegador expiró y no ingreso credenciales): correr la migración
  0017 en el SQL Editor o el script con service_role. El ranking de Productos >
  Laboratorios ya usa `products.laboratory_id`, así que al aplicarlo se llena.
  No se tocó DGII, secuencias ni datos.

## [0.18.0] - 2026-07-01

### Fixed
- **Productos > Laboratorios mostraba todo en 0** (Ventas acumuladas RD$0.00,
  Unidades 0, ranking vacío). Causa: la pantalla pasaba **`mockProducts`** a
  `computeLabSales` mientras ventas y laboratorios venían de Supabase, así que el
  join `producto→laboratorio` nunca coincidía. Ahora usa **`useProducts()`** (los
  productos reales), y los KPIs, el ranking y las barras se alimentan de las
  **ventas reales** (`useProformas`), consistente con Reportes > Ventas.

### Added
- Por laboratorio ahora también se calculan **transacciones** (ventas distintas)
  y **productos vendidos** (distintos). Fila **"Sin laboratorio"** (opt-in) con el
  total/unidades de productos vendidos sin laboratorio asignado — no cuenta como
  laboratorio activo — más alerta "Hay productos vendidos sin laboratorio asignado."
- **Exportar Excel** (3 hojas: Resumen, Ranking laboratorios, Productos por
  laboratorio) y **Exportar CSV** del ranking. `features/products/lab-sales-export.ts`.
- `computeLabProductSales` (desglose ventas por producto dentro del laboratorio).
  10 tests nuevos (agregación + export).

### Notes
- El total de laboratorios coincide con Reportes > Ventas/Productos para el mismo
  rango/sucursal (misma fuente `useProformas`, suma de `item.total`). Filtros
  (búsqueda, sucursal, fecha desde/hasta, Top N) recalculan KPIs, tabla y barras.
  No se tocó DGII, secuencias ni datos.

## [0.17.0] - 2026-07-01

### Changed
- **Renombrado el módulo "Conteo físico" → "Inventario físico"** en todo lo
  visible: menú lateral, títulos, breadcrumbs, botones, estados vacíos, KPIs del
  home, reportes (Reporte de inventario físico) y catálogo de permisos. Las rutas
  siguen en `/conteo-fisico` (para no romper enlaces/tests).

### Added
- **Herramienta real de escaneo** (`Inventario físico > Escanear productos`,
  `/conteo-fisico/[id]/escanear`): input siempre enfocado que funciona con
  **lector de código de barra** (Enter → busca por barcode o SKU → suma +1 →
  limpia y mantiene el foco), **entrada manual** (buscar producto + cantidad) y
  enlace a **modo móvil/cámara**. Suma automática (una fila por producto, sin
  duplicar), **comparación stock sistema vs contado** con diferencia coloreada
  (verde/rojo/ámbar), contadores grandes, último escaneado, **escaneos recientes**
  (con resultado Encontrado/Duplicado/No encontrado), filtros (buscar / solo
  diferencias). Producto no encontrado se registra y avisa.
- **Nuevo inventario** (`/conteo-fisico/nuevo`) ahora crea de verdad la sesión
  (Nombre, Sucursal, Tipo, Categoría/Marca/Laboratorio opcional, Nota) y abre el
  escáner con "Crear y empezar a escanear".
- **Aprobar inventario** con resumen (revisados, escaneos, sin diferencia,
  faltantes, sobrantes, valor estimado) y opciones **Aprobar sin ajustar** /
  **Aprobar y generar ajustes** (aplica el delta al lote FEFO vía el ajuste de
  stock existente, registrando el movimiento).
- **Store cliente** `features/inventory-counts/scan-session-store.ts`
  (localStorage + evento, patrón de `lot-store`): sesiones con ítems y bitácora
  de escaneos; hooks `useScanSessions`/`useScanSession`; adaptador que reusa el
  **Excel de inventario físico** (6 hojas) por sesión y en la lista. 8 tests.
- La lista de Inventario físico muestra los inventarios reales (Mis inventarios)
  con Continuar escanear / Exportar / Anular, más el Historial de ejemplo.

### Notes
- El módulo era **mock-only**; esta entrega lo hace **funcional del lado del
  cliente** (localStorage), suficiente para inventariar escaneando ya mismo. Queda
  para una **Fase backend**: tablas Supabase dedicadas (`physical_counts`,
  `physical_count_items/scans/adjustments`) con RLS, enlace móvil multi-dispositivo
  en tiempo real y enforcement de permisos por rol. No se tocó DGII, secuencias ni
  datos fiscales; los ajustes solo se aplican si el usuario elige "generar ajustes".

## [0.16.0] - 2026-06-30

### Added
- **Selector de Laboratorio dedicado** (`LaboratorySelect`) en el modal "Agregar
  stock al producto": buscador que **inicia en blanco** (aunque el producto ya
  tenga laboratorio), placeholder "Buscar laboratorio...", **menú amplio**
  (≥420px, alto 360px con scroll), cada opción muestra **Nombre + País · Tipo**,
  orden alfabético con coincidencias exactas primero, "Sin resultados", y opción
  **"+ Crear laboratorio"** dentro del dropdown y como botón. El laboratorio
  seleccionado se muestra como **chip** con botón para quitarlo.
- **Semilla de 60 laboratorios** (`lib/mock-data/laboratory-seed.ts`):
  dermocosmética internacional (ISDIN, La Roche-Posay, Vichy, Eucerin, Avène,
  Bioderma, CeraVe, …), farmacéuticas y **20 laboratorios dominicanos**
  (Dr. Collado, Rowe, Magnachem, Lam, Feltrex, Alfa, Unión, Mallén, …). Sin
  duplicar por nombre normalizado. El catálogo mock se amplió a ≥50.
- Migración **no destructiva** `0016_laboratories_seed.sql`: inserta los 60
  laboratorios para cada negocio solo si no existen (dedup por nombre en
  minúsculas). Idempotente; no borra/resetea/trunca. Solo name/country (sin
  cambios de esquema); el "tipo" se deriva en la UI por nombre.
- Campo `type?` (solo UI) en `Laboratory`; subtítulo País · Tipo derivado del
  nombre (`laboratoryTypeByName`). 28 tests nuevos.

### Changed
- La creación rápida de laboratorio (Nombre*, País, Tipo, Nota) mantiene los
  datos del lote, selecciona el nuevo automáticamente y evita duplicados
  (case/acento-insensitive). Mensajes claros, sin ids ni errores técnicos.

## [0.15.0] - 2026-06-30

### Added
- **Excel profesional del Inventario físico** (`Inventario-fisico-{sucursal}-
  {fecha}.xlsx`) con **6 hojas**: Resumen (datos + KPIs + valores de diferencia),
  Detalle contado, Diferencias (solo ítems con diferencia + acción recomendada),
  Escaneos (cada escaneo con cantidad acumulada), Productos no encontrados y
  Ajustes generados (movimientos del conteo). Botón **Exportar Excel** en el
  detalle de conteo y en la lista (exporta TODOS los conteos filtrados, no solo
  la página). Botón **Imprimir** (window.print → PDF del navegador) en el detalle.
- Lógica pura testeable: `features/inventory/physical-count-report.ts` (deriva
  filas/KPIs, resuelve nombres legibles sin exponer ids ni almacén) +
  `physical-count-export.ts` (SheetJS). 15 tests.
- Las diferencias se colorean con **códigos de formato numérico** (`[Red]`
  negativos, `[Blue]` positivos) — lo único que la edición community de SheetJS
  escribe; montos en `RD$`. Hojas vacías muestran nota ("No se generaron ajustes…").

### Notes
- Módulo de conteo es **mock-only** (sin store ni flujo de aprobación real): el
  Excel exporta los datos del modelo existente. No hay registro persistido de
  "no encontrados"/duplicados ni generador de ajustes; esas hojas salen de lo que
  el modelo provee (escaneos sin producto / movimientos con `reference` al conteo)
  y muestran nota cuando están vacías. No se tocó DGII, secuencias ni datos.

## [0.14.0] - 2026-06-30

### Changed
- **Modal "Agregar stock al producto": el campo "Proveedor" pasó a ser
  "Laboratorio".** Ahora es un buscador/autocompletado de laboratorios reales del
  sistema (mismos del módulo Productos > Laboratorios) con opción
  **"+ Agregar laboratorio"** en línea (Nombre + País), detección de duplicados
  por nombre sin distinguir mayúsculas/acentos, y auto-selección al crear.
  Placeholder: "Buscar o seleccionar laboratorio".
- El **laboratorio pertenece al producto, no al lote**: al guardar stock, si se
  elige un laboratorio distinto al del producto (incluido el caso "producto sin
  laboratorio"), se actualiza `products.laboratory_id`. El lote sigue guardando
  solo producto, sucursal, cantidad, vencimiento y costo. No bloquea el guardado
  del stock si la actualización del producto falla (aviso suave).
- **Detalle de producto** resuelve el laboratorio contra la lista viva
  (Supabase), no solo el catálogo mock, para que un laboratorio recién creado se
  muestre por nombre.

### Added
- Columna **Laboratorio** en la tabla de **Productos** (resuelta contra la lista
  viva de laboratorios).
- Helper `setProductLaboratoryAnywhere(id, laboratoryId)` en el store de
  productos (PATCH parcial, paralelo a `setProductActiveAnywhere`).
- Tests del modal (`lot-modals.test.tsx`, 9 casos): muestra "Laboratorio" y no
  "Proveedor", carga/busca laboratorios, preselección del laboratorio del
  producto, guardado de stock y actualización del laboratorio del producto, sin
  exponer ids internos.

### Notes
- **Sin migración**: el esquema ya tenía `laboratories` y
  `products.laboratory_id` (migración 0002). Solo se respeta business_id/RLS
  existentes. No se tocó DGII real, secuencias ni datos.
- **Stock actual** ya tenía filtro y columna de Laboratorio (sin cambios).

## [0.13.0] - 2026-06-30

### Added
- **Desglose por método de pago en el Excel de Reportes > Ventas.** La hoja
  **Resumen** ahora muestra, debajo de los KPIs, una sección **MÉTODOS DE PAGO**
  con columnas Método / Transacciones / Monto / Porcentaje y fila TOTAL.
- La hoja **Métodos de pago** pasó de 3 a **6 columnas**: Método de pago,
  Cantidad de pagos, Cantidad de ventas, Monto total, Porcentaje del total y
  Ticket promedio por método, con fila **TOTAL** (pagos, ventas, monto, 100 %,
  ticket promedio general).
- Formatos profesionales: montos en `RD$#,##0.00` y porcentajes en `0.00%`.

### Changed
- En la hoja **Ventas detalle**, la columna **Método de pago** desglosa las
  ventas mixtas: `Mixto: Efectivo RD$X + Tarjeta RD$Y` (usa los pagos reales de
  la venta, no solo el resumen). Las ventas de un solo método siguen mostrando
  su etiqueta (Efectivo/Tarjeta/Transferencia/Otro).
- Los montos por método se calculan desde los **pagos reales** (`payments`) de
  cada venta; una venta mixta suma a cada grupo que la compone. Las anuladas se
  excluyen. El total de métodos coincide con el total facturado de la pantalla.

## [0.12.0] - 2026-06-30

### Changed
- **Reportería ejecutiva completada en los 6 reportes.** Reportes > Caja,
  Clientes, Conteos y Productos adoptan la misma base ejecutiva (ReportHeader,
  ReportSummaryCards, ReportSection, ReportFiltersSummary, ReportFooter,
  PrintReportButton) ya usada en Ventas e Inventario. Ahora todos comparten una
  línea visual consistente con header, KPIs en tarjetas, secciones, tablas y
  footer, y son imprimibles/PDF (página A4, detalle completo en impresión).
- **Datos reales** en estos reportes (antes mock): Caja → `useCashSessionHistory`,
  Clientes → `useCustomers`, Productos → `useProformas`/`useProducts`/`useAllLots`.
  Conteos sigue sobre su fuente actual (no hay aún hook real de conteos).

### Added
- Paginación (`DataPagination`) en las tablas de detalle de los 6 reportes y en
  **Conteo físico** y **Compras > Facturas de proveedores** (Prioridad 2).

### Notes
- DGII real, secuencias y producción fiscal **no se tocaron** (las pantallas DGII
  se dejaron intactas a propósito). Auditoría y otras listas P2 quedan para una
  próxima pasada. La validación visual de impresión/PDF queda pendiente (requiere
  sesión en la app).

## [0.11.0] - 2026-06-29

### Added
- **Reportería con formato ejecutivo profesional (base reusable).** Nuevos
  componentes en `components/reporting/report-layout.tsx`: `ReportLayout`,
  `ReportHeader` (logo/iniciales, negocio, título, subtítulo, generado por/cuándo),
  `ReportSummaryCards` (KPIs en tarjetas limpias), `ReportSection` (encabezado de
  sección corporativo con tono por prioridad), `ReportFiltersSummary` ("Sin
  filtros aplicados" / "Filtros: A = x | B = y"), `ReportFooter`,
  `ReportEmptyState`, `ReportBadge` (alta=rojo, media=azul, baja/ok=verde,
  pendiente=ámbar) y `PrintReportButton`. 7 tests.
- **Impresión / PDF**: estilos `@media print` con página **A4** dedicada
  (`@page report-page`) en `globals.css`, fondo blanco, sin sidebar, cortes
  limpios y encabezado de tabla repetido. Botón "Imprimir / PDF" (window.print()).
  Utilidades `.screen-only` / `.print-only`: en pantalla la tabla de detalle va
  **paginada**; al imprimir/PDF se incluye el detalle **completo** (todos los
  resultados filtrados).

### Changed
- **Reportes > Ventas** rediseñado con el formato ejecutivo: header, resumen de
  filtros, KPIs en tarjetas, secciones, tabla de detalle (paginada en pantalla /
  completa en PDF) y footer. Filtros, paginación y export Excel/CSV intactos.
- **Reportes > Inventario** reescrito de mock a **datos reales** (useProducts /
  useAllLots / useAllMovements / sucursales) con formato ejecutivo y secciones:
  resumen/KPIs, stock por sucursal, bajo stock, sin stock, próximos vencimientos
  (90 días), lotes vencidos, movimientos recientes y detalle tabular paginado.
  Agregación de lotes en una sola pasada (eficiente con catálogos grandes).

### Notes
- Excel/CSV sin cambios (siguen exportando los resultados filtrados completos).
  No toca DGII real, secuencias ni datos. Caja/Clientes/Conteos/Productos usarán
  esta misma base en una próxima pasada.

## [0.10.0] - 2026-06-29

### Added
- **Paginación profesional reutilizable en los listados largos.** Nuevo
  componente `DataPagination` + hook `usePagination`
  (`components/ui/data-pagination.tsx`): selector de cantidad por página
  (10/25/50/**100**, default 25), texto "Mostrando {desde}–{hasta} de {total}
  registros", botones « Primera · ‹ Anterior · Página X de Y · Siguiente › ·
  Última », versión compacta en móvil y estado "Cargando registros…". Mantiene
  filtros, búsqueda y orden (solo rebana la vista); resetea a la página 1 al
  cambiar filtros/búsqueda o el tamaño de página, y se reajusta si la lista
  encoge. 13 tests (`data-pagination.test.tsx`).
- Paginación aplicada (Prioridad 1) en: **Reportes > Ventas** (Detalle de
  ventas, 25/pág, orden fecha desc; el Excel/CSV sigue exportando TODOS los
  resultados filtrados, no solo la página, con tooltip explicativo),
  **Productos** (reemplaza su paginación manual), **Clientes**, **Ventas /
  Facturas**, **Proformas**, **Pagos**, **Inventario > Stock actual**, **Stock
  por lote** y **Movimientos**.

### Notes
- La paginación es client-side sobre las listas ya filtradas/ordenadas que
  cargan los stores reactivos; la paginación server-side real con
  `range(from,to)`+`count` requeriría refactorizar cada store/API y queda como
  trabajo futuro. No toca DGII real, secuencias ni datos.

## [0.9.0] - 2026-06-29

### Added
- **Reporte de ventas completo (Reportes > Ventas).** Se reemplazó la pantalla
  simple (mock, sin filtros) por una vista profesional que lee datos reales de
  Supabase (`useProformas`) y relaciona ventas, pagos, clientes, productos,
  cajeros, sucursales y comprobantes. Incluye:
  - **11 filtros**: Desde/Hasta, Sucursal, Método de pago (Efectivo/Tarjeta/
    Transferencia/Otro/Mixto), Tipo de comprobante (Proforma/B02/B01/E32/E31/
    Nota de crédito/Nota de débito), Estado (Pagada/Pendiente/Anulada/Devuelta/
    Parcial), Cajero, Cliente (nombre/teléfono/cédula-RNC), Producto, botones
    rápidos (Hoy/Ayer/Últimos 7/Este mes/Mes anterior/Todo), "Incluir proformas"
    y "Limpiar filtros". Por defecto muestra facturas pagadas; las proformas no
    se mezclan con facturas sin indicar el tipo.
  - **10 KPIs**: Total facturado, ITBIS recaudado, Transacciones, Items
    vendidos, Ticket promedio, Clientes distintos, Descuentos, Devoluciones,
    Neto después de devoluciones y Margen estimado (si hay costo).
  - **Gráficas/resúmenes**: tendencia (por día, o por hora si el rango es un
    solo día), medios de pago (usa los pagos reales), ventas por sucursal, top
    cajeros, productos más vendidos, clientes principales y comprobantes.
  - **Tabla detallada** ordenable (Fecha, Total, Cliente, Cajero, Método,
    Estado, Tipo documento; por defecto fecha más reciente primero) con
    columnas Fecha/hora, Sucursal, Comprobante, Tipo, Cliente, Cajero, Items,
    Método, Subtotal, ITBIS, Descuento, Total, Estado y Acciones.
  - **Acciones por venta** (menú): Ver detalle, Editar (si permitido), Imprimir,
    Enviar WhatsApp, Descargar PDF, Ver pagos (modal), Ver movimientos de
    inventario y Anular (con confirmación). Sin UUIDs ni errores técnicos.
  - **Exportar Excel** (7 hojas: Resumen, Ventas detalle, Métodos de pago, Por
    cajero, Por sucursal, Productos vendidos, Clientes; con título, rango,
    filtros usados, formato RD$ y anchos de columna) y **Exportar CSV** (BOM
    UTF-8, mismas columnas que la tabla). Export client-side desde la vista ya
    filtrada.
- Lógica pura y testeada en `features/sales/sales-report.ts` y
  `sales-report-export.ts`; helper de descarga `lib/utils/download.ts`. No toca
  DGII real, secuencias, certificados ni datos: solo lee y agrega.

## [0.8.13] - 2026-06-29

### Added
- **Movimientos de efectivo del turno de caja.** En **Ventas > Caja**, con un
  turno abierto, se pueden registrar tres tipos de movimiento manual de efectivo:
  - **Ingreso de efectivo** (p. ej. fondo para vuelto),
  - **Retiro de efectivo** (p. ej. pago a proveedor desde caja),
  - **Devolución de dinero** al cliente.

  Cada movimiento queda ligado a la sesión de caja, con monto, motivo opcional y
  autor. La lista del turno los muestra con signo (+/−) y el **"Dinero esperado
  en caja"** se recalcula automáticamente: solo el efectivo afecta el conteo
  físico (`base + ventas efectivo + ingresos − devoluciones − retiros`). El
  **export Excel del turno** incluye los movimientos.
- Nueva tabla `cash_movements` (migración `0015`, aditiva/idempotente, RLS
  multi-tenant por `business_id`, ligada a `cash_register_sessions`). No toca
  DGII, secuencias ni datos existentes.
- API `GET/POST /api/cash/[id]/movements` con validación de tipo y monto;
  responde 409 en modo `DATA_SOURCE=mock`.

## [0.8.12] - 2026-06-29

### Added
- **Vista "Detalles del turno en curso" en Caja** + **export Excel del turno**.
  La pantalla **Ventas > Caja** ahora muestra, cuando hay un turno abierto, una
  vista clara para cajero/admin:
  - Card principal: fecha de inicio, cajero · sucursal · sesión, **total de
    ventas**, y el desglose de movimientos (base inicial, ventas en efectivo,
    por tarjeta, por transferencia, otros, devolución de dinero, ingresos y
    retiros de efectivo, total de movimientos del turno).
  - Card "**Dinero esperado en caja**" con el texto explicativo y el valor en
    grande; muestra efectivo contado y diferencia cuando la caja fue contada.
  - Botón **"Exportar Excel"** (descarga `.xlsx` profesional) y **"Cerrar
    turno"** en el encabezado.
  - **Motor de cálculo puro** `features/sales/cash-session-detail.ts`
    (`computeShiftDetail`): agrega los pagos reales de las proformas de la
    sesión por método. **El dinero físico esperado en caja cuenta SOLO efectivo**
    (base + ventas efectivo + ingresos − devoluciones − retiros); tarjeta y
    transferencia se reportan como ventas pero no aumentan el efectivo.
  - **Reporte Excel** `server/services/sales/cash-shift-xlsx.ts` (SheetJS) +
    ruta `GET /api/cash/[id]/export` (turno en curso, RLS por business_id).
  - Se reemplazaron las tarjetas de caja que mostraban totales estáticos
    (`session.totals`/`expected_cash` no se recalculaban) por estos valores
    calculados de los pagos reales.

### Notas
- El modelo de pagos no separa tarjeta de **débito/crédito** (solo `card` +
  procesadores) → se reporta una línea "Ventas por tarjeta". Los **ingresos /
  retiros de efectivo y devoluciones** manuales quedan en RD$0.00 hasta agregar
  el módulo de movimientos de caja (tabla + UI); el motor de cálculo ya los
  soporta. DGII real sigue apagado; no se tocaron datos ni secuencias.

## [0.8.11] - 2026-06-27

### Changed
- **Acceso al POS movido a un botón en Ventas / Facturas.** Se quitó
  "POS / Nueva venta" del submenú izquierdo de **Ventas** (queda: Ventas,
  Proformas, Pagos, Devoluciones, Notas de crédito, Caja) y se agregó un botón
  verde **"+ POS / Nueva venta"** arriba a la derecha de la pantalla
  **Ventas / Facturas** (icono `+`, `aria-label` "Ir a POS / Nueva venta",
  tooltip "Crear nueva venta") que navega a `/pos`.
  - La página `/pos` **no se eliminó**: sigue funcionando por URL directa.
  - Archivos: `components/layout/sidebar.tsx` (config `groups` ahora exportada
    para test) y `app/(app)/ventas/page.tsx` (slot `actions` del `PageHeader`).
  - Tests nuevos: el sidebar de Ventas ya no lista "POS / Nueva venta" ni `/pos`;
    Ventas/Facturas muestra el botón enlazando a `/pos`.

## [0.8.10] - 2026-06-27

### Changed
- **Las facturas electrónicas e-CF ya no se pueden editar** (E31/E32/E33/E34/
  E41/E43, `documentKind: "invoice"` + `ecfType` / comprobante que empieza con
  "E"), ni siquiera en demo/mock. Por seguridad fiscal el único camino de
  corrección es nota de crédito, nota de débito o anulación.
  - **Regla central** en `features/sales/editability.ts`: `documentEditability`
    bloquea e-CF con `blockedBy: "ecf"` y mensaje claro; `isElectronicInvoice`
    expone la detección. Una factura **NCF B01/B02** demo mantiene la edición
    controlada (solo cliente/teléfono/documento/notas) como antes.
  - **UI**: en **Ventas / Facturas** el botón "Editar factura" queda
    deshabilitado con tooltip para e-CF; la página `/ventas/[id]/editar` muestra
    una pantalla de bloqueo (entrar por URL directa) con botones "Volver a la
    factura", "Crear nota de crédito" y "Anular comprobante".
  - **Backend**: el `PATCH /api/proformas/[id]` (action `update`) ya revalidaba
    la editabilidad en el servidor; ahora además **audita el intento bloqueado**
    de editar un e-CF (`action: sale.edit_blocked_ecf`,
    `reason: electronic_invoice_locked`) sin modificar el documento. El store
    local (`updateProformaAnywhere`) añade el mismo guard como defensa en
    profundidad.

## [0.8.9] - 2026-06-27

### Fixed
- **La factura tradicional NCF ya no muestra datos de factura electrónica e-CF
  en la impresión/PDF**. Una factura B01/B02 imprimía por error `e-NCF`,
  `Validar: ecf.dgii.gov.do`, código de seguridad, fecha de firma y la nota de
  "Envío Diferido / convertido a e-CF" — todos datos exclusivos de e-CF. La raíz
  estaba en el ticket 80mm (`features/sales/components/receipt-80mm.tsx`), que
  mostraba el bloque e-CF para cualquier factura.

### Added
- **Helper central `getDocumentPrintContext`**
  (`features/sales/document-print-context.ts`): a partir del tipo de documento
  (NCF / e-CF / proforma) devuelve banderas `isNcf`/`isEcf`/`isProforma`,
  `showNcf`/`showEcf`/`showDgiiValidation`/`showSecurityCode`/
  `showDigitalSignature`/`showDeferredNote`/`showFiscalDemoNote` y el rótulo de
  número (`NCF` / `e-NCF` / `No.`). Es la fuente única para qué datos fiscales
  puede imprimir cada comprobante.
  - **NCF**: muestra `NCF: B0x…`, sin ningún dato e-CF; nota demo
    "Documento generado en ambiente demo. No corresponde a emisión fiscal real."
  - **e-CF**: muestra `e-NCF: E3x…`, validación DGII, código de seguridad, fecha
    de firma y modalidad diferida.
  - **Proforma**: sin datos fiscales ("Esta proforma no tiene validez fiscal").
  - El PDF A4 (`document-pdf.ts`) y el mensaje de WhatsApp (`proforma-share.ts`)
    ya respetaban el tipo; se blindaron con tests (NCF no menciona e-CF; e-CF sí
    dice "representación impresa"). Tests nuevos de contexto y de render del
    ticket por tipo.

## [0.8.8] - 2026-06-27

### Added
- **Envío de factura/proforma por WhatsApp con PDF adjunto (enlace)**. El botón
  "Enviar WhatsApp" (POS-detalle, Ventas/Facturas, Proformas, vista de documento)
  ya no manda solo texto: arma un mensaje **profesional** y un **enlace de
  descarga al PDF**.
  - **Generación de PDF** (`server/services/sales/document-pdf.ts`, pdfkit, A4):
    logo DermaLand vectorial, identidad del emisor (razón social, RNC, dirección,
    teléfono, WhatsApp, Instagram), tipo de documento (Proforma / Factura de
    Consumo o Crédito Fiscal / e-CF demo), número/comprobante, fecha, cliente,
    cajero, ítems (cant./precio/total con lote), totales (subtotal, descuento,
    ITBIS, **TOTAL**), forma de pago (solo últimos 4, nunca el PAN) y nota
    **DEMO / sin validez fiscal** cuando corresponde. No imprime UUIDs ni datos
    técnicos.
  - **Enlace al PDF**: `GET /api/proformas/[id]/pdf` — descargable por el
    personal con sesión (RLS) y, vía **token firmado** (`?t=…`, HMAC-SHA256 en
    `share-token.ts`), abrible por el cliente sin sesión (lectura acotada por
    `business_id` con service-role). Nombre de archivo `Factura-…pdf` /
    `Proforma-…pdf`.
  - **Preparación del envío**: `POST /api/proformas/[id]/share/whatsapp` valida
    teléfono, firma el enlace al PDF, arma mensaje + `wa.me` y registra auditoría
    `sale.whatsapp_share`.
  - **Mensajes profesionales** por tipo (factura / proforma / e-CF demo) con
    "Le compartimos su factura en PDF", el enlace y el pie de DermaLand
    (`buildWhatsappShareMessage`). Teléfono normalizado a RD (+1).
  - **WhatsApp Web** (no hay API): se abre con el mensaje + enlace (apertura de
    pestaña a prueba de bloqueadores). Si el cliente no tiene teléfono:
    "Este cliente no tiene teléfono/WhatsApp registrado."

### Notas
- Sin cambios de esquema en producción: el PDF se genera bajo demanda desde la
  fila autoritativa (no se persisten archivos), evitando provisionar buckets.
- Para que el **cliente** (sin sesión) abra el PDF en producción debe existir
  `SUPABASE_SERVICE_ROLE_KEY`; sin ella, el enlace funciona para el personal con
  sesión. DGII real permanece **apagado**.

## [0.8.7] - 2026-06-27

### Added
- **Acción "Editar factura" en Ventas / Facturas** (icono lápiz, tooltip y
  aria-label "Editar factura"). Orden: Ver | Editar | Imprimir | Enviar | Anular.
  - Ruta `/ventas/[id]/editar` que carga el documento **desde Supabase** (no
    localStorage) vía `useProformaDocument`.
  - **Edición segura de datos NO fiscales**: cliente del documento (nombre,
    teléfono, documento) y notas. Montos, ítems, descuento, número y comprobante
    quedan **bloqueados** (requieren nota de crédito / anulación).
  - **Bloqueos**: documentos anulados o emitidos fiscalmente (convertidos a
    e-CF) no se editan — mensaje "Esta factura ya fue emitida fiscalmente. Para
    corregirla debes emitir una nota de crédito o anulación…".
  - **Permisos**: solo `super_admin` / `admin` / `manager` (`canEditSales`);
    cajero sin permiso ve el botón deshabilitado con "No tienes permiso para
    editar facturas." El permiso se **revalida en el servidor**.
  - **Auditoría**: cada edición registra en `audit_logs` (acción `sale.update`,
    entidad, usuario, campos cambiados con valor anterior→nuevo).
- `ProformaRepository.update` (mock + Supabase, solo columnas no fiscales),
  `PATCH /api/proformas/:id` `action:"update"`, `updateProformaAnywhere`.
- Helpers puros `documentEditability` / `pickEditableProformaFields` +
  `canEditSales`. +9 tests.

### Security
- La edición nunca toca número/ncf/ecf/montos/ítems; permiso y editabilidad se
  validan en el servidor; auditoría obligatoria. DGII real apagado.

## [0.8.6] - 2026-06-27

### Fixed
- **Imprimir/ver un documento abría "Documento no encontrado / los datos viven
  en localStorage".** Dos causas de raíz:
  1. Las páginas de detalle e impresión (`/proformas/[id]` y `/print`) leían
     **solo de localStorage** (`getProformaByIdFromStore`), nunca de Supabase.
     En producción (Supabase) el documento real no estaba en localStorage → no
     encontrado + mensaje engañoso.
  2. Tras cobrar, el POS usaba el **id local temporal** (`prof_…`) para el
     recibo y los enlaces de impresión, en vez del **UUID** que devuelve
     Supabase → la URL apuntaba a un id inexistente.
- **Carga server-aware**: nuevo hook `useProformaDocument(id)` que lee el
  documento desde **Supabase** (`GET /api/proformas/:id`) en producción y desde
  el store en local, con estado `loading`. Las vistas muestran "Cargando
  documento…" y, si no existe, un mensaje **amigable** (sin localStorage, sin
  UUID crudo, sin `SupabaseRepository`).
- **POS** usa el **id persistente** del servidor (`res.proforma.id`) para el
  recibo y enruta impresión por tipo (factura → `/ventas`, proforma →
  `/proformas`).

### Added
- Vistas compartidas `DocumentDetailView` / `DocumentPrintView` (server-aware),
  montadas en `/proformas/[id]` **y** `/ventas/[id]` (+ `/print`). Las facturas
  NCF/e-CF abren bajo **/ventas**; las proformas bajo **/proformas**.
- `documentRouteBase(doc)` (factura → `/ventas`, proforma → `/proformas`) — una
  factura B02/B01/e-CF nunca se manda a la ruta de proforma. La lista de Ventas
  enlaza ver/imprimir a `/ventas/:id`. +5 tests (rutas + sin mensaje localStorage).

### Security
- En producción los documentos (ventas/proformas/facturas) se leen **solo de
  Supabase**; localStorage queda para preferencias/branch/draft. DGII real
  apagado. Sin exponer IDs técnicos ni errores crudos en UI.

## [0.8.5] - 2026-06-27

### Fixed
- **Al refrescar, el selector de sucursal mostraba "Sin sucursales" unos
  segundos** antes de aparecer la sucursal. Causa raíz: en modo Supabase el
  store arrancaba con `list: []` y **no tenía estado `loading`**, así que el
  header confundía "cargando" con "vacío".
  - `useBranchesState`/`useCurrentBranch` ahora exponen **`loading`** (true
    durante el primer fetch en Supabase; false en local).
  - El header distingue 3 estados: **"Cargando sucursales…"** (o el nombre
    cacheado) mientras carga; **"Sin sucursales"** solo si tras cargar no hay
    ninguna; y el `<select>` normal cuando hay sucursales.
  - Selección de **sucursal principal** por prioridad: guardada-si-activa →
    piloto/principal (`isPilot`) → primera activa por nombre. Si la guardada ya
    no existe/está inactiva, se limpia y reselecciona sin error técnico.
  - **Nombre cacheado** (`dermaland.current-branch-name`, solo para mostrar
    durante la carga; nunca como fuente de datos) → para usuarios recurrentes
    aparece la sucursal sin parpadeo. Lectura tras montar (hidratación segura).
- **POS** no carga catálogo/stock hasta tener sucursal válida: muestra
  **"Cargando sucursal…"** mientras carga, o un aviso si no hay sucursales
  activas. Nunca opera con `branchId` vacío.

### Added
- `pickPrincipalBranch`, `cacheCurrentBranchName`, `readCachedCurrentBranchName`
  en branch-store. +4 tests (incluye prioridad piloto y orden por nombre).

### Security
- Sin IDs técnicos en UI (nunca UUID/branch_id/almacén). DGII real apagado.

## [0.8.4] - 2026-06-27

### Fixed
- **Una venta NCF (B02/B01) seguía apareciendo en Proformas con número
  PROF-…** aunque el modal decía "Factura de consumo (B02)". Dos causas:
  1. En `finalizeCharge`, el `number` del documento siempre era
     `generateProformaNumber()` (PROF-…), incluso para facturas. Ahora el
     número es el **comprobante reservado** (B02…/B01…/E32…/E31…) para
     facturas; PROF-… queda **solo** para proformas reales.
  2. La pantalla **Proformas** (`/proformas`) listaba TODOS los documentos sin
     filtrar por `document_kind`, así que las facturas se mostraban ahí.
- DermaLand usa **una sola tabla `proformas`** como almacén de documentos de
  venta; la distinción es por `document_kind` + `ecf_type`. Ahora:
  - **Proformas** (`/proformas`) muestra **solo** proformas reales.
  - **Ventas / Facturas** (`/ventas`) muestra las **facturas NCF/e-CF** con
    columna **Documento** (B02/B01/E32/E31) y el número de comprobante; además
    pasó a usar **datos en vivo** (`useProformas`) en lugar del seed estático.

### Added
- Clasificador puro `features/sales/document-label.ts`
  (`classifySaleDocument`, `isProformaDocument`, `isInvoiceDocument`,
  `saleDocumentLabel`, `saleDocumentTone`) — mismo criterio en POS y listados.
  +14 tests.

### Security
- DGII real apagado; mock/demo no consume secuencia fiscal real.

## [0.8.3] - 2026-06-27

### Fixed
- **El POS ignoraba "Forma de facturación principal" y emitía Proforma/e-CF
  por defecto.** Causa raíz: `finalizeCharge` y el badge del modal usaban el
  resolver legado `resolveDocumentToIssue` (solo método de pago), que no mira
  `billing_settings.defaultBillingMode`. Ahora ambos usan el motor config-aware
  `resolveAutoBilling`:
  - **NCF tradicional** → consumidor final **B02**, cliente con RNC **B01**,
    siempre al cobrar (nunca Proforma ni e-CF, ni "pendiente para cierre").
  - **e-CF** → consumidor **E32**, RNC **E31**; tarjeta e-CF inmediato;
    efectivo/transferencia queda **proforma pendiente de e-CF al cierre** si la
    regla está activa.
  - **Ambos** → manual (elige el usuario) o automático (reglas por método).
  - El modal ya no dice "Documento a emitir: Proforma" cuando corresponde
    B02/B01; muestra el comprobante correcto y, al cobrar, el número emitido.

### Added
- `comprobanteToDocType` (B02→consumo, B01→crédito fiscal, E32/E31→ecf_32/31).
- `reserveNextPreferred(docType, env)` en numbering-store: reserva el siguiente
  número de la secuencia **activa/preferida** en ambiente **no productivo**
  (tolerante mock/demo/testecf), valida `next ≤ end`, e incrementa en demo;
  mensajes "No hay numeración activa para este tipo de comprobante." y "La
  numeración se agotó.". **Nunca** reserva de `produccion` (DGII real apagado).
- `finalizeCharge` reserva la secuencia correcta y guarda el comprobante en
  `ecf_number` (NCF B02/B01 o e-CF E32/E31), con `document_kind=invoice`,
  `ecf_type` solo para e-CF y `sequence_type` consumo/crédito.
- Configuración de facturación: nota visible en NCF tradicional ("Las reglas
  e-CF solo aplican cuando la forma principal es e-CF o Ambos").
- +20 tests (NCF B02/B01, e-CF cierre, comprobanteToDocType, reserveNextPreferred).

### Security
- Mock/demo no consume secuencia fiscal real; producción nunca se reserva por
  esta vía. DGII real apagado.

## [0.8.2] - 2026-06-27

### Added
- **Cliente obligatorio para facturar en POS.** El cobro exige un cliente real;
  ya no se puede facturar como "walk-in / consumidor final".
  - Guard puro y testeable `features/pos/checkout-guards.ts`
    (`isRealCustomerSelected`, `customerChargeBlock`, `CUSTOMER_REQUIRED_MESSAGE`).
    Es la **1ª validación** del cobro (antes de carrito/caja/stock/pago). +12 tests.
  - Al hacer clic en "Cobrar venta" sin cliente: toast
    *"Debes seleccionar o crear un cliente antes de facturar."*, se marca el
    selector en rojo con hint "Cliente obligatorio para facturar.", se abre/enfoca
    el selector y **no** se abre el cobro, **no** se guarda nada, **no** se llama
    a Supabase, **no** se descuenta stock.
  - **Alta rápida de cliente desde el POS** (`QuickCreateCustomerModal`): nombre,
    apellido y teléfono obligatorios; documento/email/tipo de piel opcionales. Al
    crear, el cliente queda **seleccionado automáticamente** y se puede cobrar.
  - `CustomerSearchSelect` ahora expone un handle imperativo (`open()`/`focus()`),
    soporta estado `invalid` y, con `allowWalkIn={false}`, muestra "Selecciona un
    cliente para facturar" y oculta la opción walk-in.

### Security
- Defensa en profundidad: `finalizeCharge` revalida el cliente, por lo que nunca
  se envía "walk-in" como `customer_id` a Supabase. DGII real apagado.

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
