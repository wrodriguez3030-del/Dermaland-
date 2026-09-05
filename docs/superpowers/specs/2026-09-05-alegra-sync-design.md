# Sincronizador diario Alegra → DermaLand — Diseño

**Fecha:** 2026-09-05 · **Estado:** aprobado por el dueño en conversación (opciones 1, A y «sí» al stock) · **Versión objetivo:** v0.141.x → v0.145

## 1. Objetivo

Que DermaLand tenga, cada mañana y sin pasos manuales, la misma verdad que Alegra:
clientes, proveedores, productos (precio, costo, código de barras, activo), stock por
sucursal y el historial completo de facturas de venta con sus pagos y saldos. Alegra
sigue siendo el sistema contable y fiscal; DermaLand **solo lee**.

## 2. Decisiones tomadas (no reabrir sin el dueño)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Alegra manda, DermaLand lee.** Nunca se escribe en Alegra. | Elegido por el dueño (opción 1). Sin conflictos ni duplicados. |
| 2 | **Las facturas de Alegra viven en tablas propias**, separadas de `proformas`/POS/tienda. | Opción A. No se cuenta una venta dos veces ni se contamina el cierre de caja. |
| 3 | **El stock de las dos sucursales se iguala a Alegra cada día.** | «Sí» del dueño. Consecuencia aceptada: lo vendido en DermaLand debe facturarse en Alegra el mismo día o el stock «vuelve». |
| 4 | **Los contactos se emparejan por teléfono/WhatsApp/correo normalizados antes de crear**, misma regla que el pedido web (`pickClientMatch`). | Pedido explícito del dueño: «validar que no se duplique por teléfono y nombre o correo». |
| 5 | Nada se borra: lo que desaparece o se anula en Alegra se marca inactivo/anulado. | Trazabilidad. |
| 6 | Precio y costo mandan desde Alegra; una edición manual en DermaLand se pisa a diario. La UI lo avisa. | Consecuencia de 1. |

## 3. Hechos de la API de Alegra (verificados 2026-09-05 con la cuenta real)

- Base `https://api.alegra.com/api/v1`, `Authorization: Basic base64(email:token)`. Credenciales en `apps/web/.env.local` (`ALEGRA_EMAIL`, `ALEGRA_TOKEN`) y en secretos de GitHub Actions. Nunca en el repo ni en el chat.
- **150 peticiones/minuto** (429 al pasarse; cabeceras `X-Rate-Limit-Remaining` / `-Reset`). Páginas de **máx. 30** (`start`, `limit`); `metadata=true` devuelve `total` (tope 10 000).
- Empresa «DermaLand», RNC 132590775. Almacenes: `1` «Principal» → sucursal **DermaLand Principal**; `2` «CUTIS» → sucursal **Dermaland  Villa Olga**. Una lista de precios «General» (DOP, **sin ITBIS**; `products.price` de DermaLand es CON ITBIS: `1779.661 × 1.18 = 2100`).
- Volúmenes: 1 487 ítems · 6 478 contactos cliente · 1 proveedor · ~15 000 facturas desde 2023-02-01 (~450–580/mes) · 17 014 pagos.
- **Ítems** (`GET /items?fields=customFields`): `id`, `name`, `status`, `price[0].price`, `inventory.unitCost`, `inventory.unit` (UND/LITRO), `inventory.warehouses[].{id,availableQuantity}`, `customFields[key=barcode].value` (UPC-A de 12 dígitos, p. ej. `072140452315`). `reference` viene vacío.
- **Contactos** (`GET /contacts?type=client|provider`): `id`, `name`, `phonePrimary`, `mobile`, `email` (casi nunca), `identification` (RNC 9 / cédula 11 dígitos, a veces), `identificationObject` (normalmente vacío), `status`, `created_at`, `updated_at`. **Sin filtro por fecha** → barrido completo diario (216 páginas, ~1,5 min).
- **Facturas** (`GET /invoices`): filtros `date_after`, `date_afterOrNow`, `date_before`, `status`, `client_id`. Objeto: `id`, `date`, `datetime`, `status` (`open|closed|void|draft`), `numberTemplate.{prefix,fullNumber}` (NCF: `B02` consumo, `B01` crédito fiscal), `client.{id,name,identification,identificationType CED|RNC}`, `warehouse.{id,name}`, `seller.{id,name}`, `paymentMethod` (`cash|credit-card|debit-card|transfer…`), `subtotal`, `discount`, `tax`, `total`, `totalPaid`, `balance`, `items[].{id,name,price,quantity,discount,discountAmount,tax[].amount,total}`, `payments[].{id,date,amount,paymentMethod,status}`, `station.name`.
- Webhooks solo para altas (`new-invoice`, `new-client`, `new-item`); no para cambios. **No se usan en v1.**

## 4. Arquitectura

```
scripts/alegra-sync.mts  (tsx; --dry-run por defecto, --apply, --full, --entities=…)
        │
        ├─ src/server/services/alegra/client.ts      ← HTTP + paginación + límite 150/min + reintentos
        ├─ src/features/alegra/mappers/*.ts          ← PUROS: contacto→cliente, ítem→producto, factura→filas
        ├─ src/features/alegra/plan-*.ts             ← PUROS: qué crear/actualizar/desactivar (diff)
        └─ escritura vía PostgREST (service_role), misma semántica que la app:
              clients / suppliers / products / product_lots+inventory_movements (motor buildImportPlan)
              alegra_invoices / alegra_invoice_items / alegra_sync_runs
```

- **Motor puro + I/O aparte**, como `alegra-import.ts`: los mapeos y el cálculo de diferencias no tocan red ni reloj, y se prueban con fixtures reales anonimizados.
- El script **reutiliza** `buildImportPlan`/`applyImportPlan` (stock), `barcode-match.ts` (códigos), `pickClientMatch` + `customer-normalization.ts` (clientes), `product-sku.ts` + `product-parser.ts` + `pricing.ts` (productos nuevos), exactamente igual que `migrar-inventario-alegra.mts`.
- **Dónde corre:** GitHub Actions `.github/workflows/alegra-sync.yml`, `cron: "0 10 * * *"` (06:00 RD), `workflow_dispatch`, `concurrency: alegra-sync`, `timeout-minutes: 40`, Node 20. Secretos: `ALEGRA_EMAIL`, `ALEGRA_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Mismo patrón que `backup.yml` (activo y en verde desde agosto).
- **Disparo manual desde la app:** `POST /api/alegra/sync` (roles admin/manager) llama a la API de GitHub `workflow_dispatch` con el secreto `GITHUB_ACTIONS_TOKEN` (PAT fine-grained, solo `actions:write` en este repo). La pantalla muestra el estado leyendo `alegra_sync_runs`.

## 5. Datos

### 5.1 Migraciones (una sola, `0045_alegra_sync.sql`)

- `products.alegra_id text`, `clients.alegra_id text`, `suppliers.alegra_id text` — `unique (business_id, alegra_id)` parcial (`where alegra_id is not null`).
- `clients.source` admite además `'alegra'` (ampliar el CHECK).
- `alegra_invoices` (`id uuid`, `business_id`, `alegra_id text unique por negocio`, `branch_id` (por almacén), `client_id` (FK `clients`, nullable), `alegra_client_id`, `client_name`, `client_document`, `client_document_type`, `ncf text`, `ncf_prefix text`, `date date`, `issued_at timestamptz`, `status text` (`open|closed|void|draft`), `payment_method text`, `seller_name text`, `station text`, `subtotal numeric`, `discount numeric`, `itbis numeric`, `total numeric`, `total_paid numeric`, `balance numeric`, `payments jsonb` (array tal cual), `raw jsonb` (objeto de Alegra sin `items`), `synced_at`, `created_at`, `updated_at`).
- `alegra_invoice_items` (`id uuid`, `business_id`, `invoice_id` FK, `line_no int`, `alegra_item_id text`, `product_id` FK `products` nullable, `name`, `quantity numeric`, `unit_price numeric` (sin ITBIS), `discount numeric`, `itbis numeric`, `total numeric`).
- `alegra_sync_runs` (`id`, `business_id`, `started_at`, `finished_at`, `ok bool`, `trigger text` (`cron|manual|cli`), `mode text` (`full|incremental`), `dry_run bool`, `counts jsonb` (por entidad: leídos/creados/actualizados/desactivados/omitidos), `errors jsonb`, `reference text` (la del stock), `log_url text`).
- Índices: `alegra_invoices (business_id, date desc)`, `(business_id, client_id)`, `(business_id, status) where balance > 0`; `alegra_invoice_items (product_id)`.
- RLS igual que el resto (`business_id = auth_business_id()`), solo lectura para roles de la app; escribe el service_role.

### 5.2 Mapeos (puros, con test por cada regla)

**Contacto → cliente** (`type` incluye `client`):
- `name` → `splitFullName` → `first_name`/`last_name`; `phonePrimary` (o `mobile`) → `phone` y `whatsapp` con `formatDominicanPhone`; `email`; `identification` → 9 dígitos = `rnc`, 11 dígitos = `cedula`, otro = `passport`; `status` → `deleted_at` NO (se conserva) y `tags` incluye `alegra-inactivo` si `inactive`; `source = 'alegra'`; `alegra_id`.
- Emparejar: (1) `alegra_id` ya guardado; (2) `pickClientMatch` por teléfono/WhatsApp/correo normalizados (la ficha más antigua gana) → se le pone `alegra_id`; (3) documento normalizado igual; (4) si nada, crear. Nunca por nombre solo.
- Al actualizar una ficha ya emparejada solo se rellenan campos vacíos (teléfono, correo, documento); no se pisa lo que el mostrador escribió, salvo `alegra_id`.
- Contacto `type` con `provider` → `suppliers` (`name`, `rnc`, `phone`, `email`, `alegra_id`); emparejar por `rnc` o nombre exacto.

**Ítem → producto:**
- Emparejar: (1) `alegra_id`; (2) `normalizeProductName(name)` único (motor existente) → se guarda `alegra_id`; (3) código de barras (`sameBarcode`); (4) crear con las mismas reglas que `migrar-inventario-alegra.mts` (SKU secuencial, marca/laboratorio/categoría inferidos, lote inicial provisional).
- Actualizar SIEMPRE: `cost = inventory.unitCost`, `price = round2(price[General] × (1 + itbis/100))`, `active = status === 'active'`, `alegra_id`. Nombre: solo si `normalizeProductName` cambió (Alegra lo renombró) → `cleanName(nuevo)`. Código de barras: solo si DermaLand no tiene; si tiene otro distinto (no `sameBarcode`), se reporta y no se toca.
- Ítems que ya no existen en Alegra → `active = false` (no se borran).

**Stock:** `inventory.warehouses[id=1].availableQuantity` → Principal; `[id=2]` → Villa Olga. Se arma `AlegraRow[]` `{name, qtyPrincipal, qtyTotal}` **por producto emparejado** y se llama a `buildImportPlan` + `applyImportPlan` con referencia `ALEGRA-SYNC-YYYYMMDD-HHmm`. Productos sin lote en Principal → lote inicial provisional (1 año) como hoy. Cuarentena y recall quedan fuera (motor).

**Factura → `alegra_invoices` + items:** upsert por `alegra_id`; `branch_id` por `warehouse.id`; `client_id` por `alegra_client_id` (tras sincronizar contactos); `product_id` por `alegra_item_id`; `ncf = numberTemplate.fullNumber`; `itbis = tax`; `payments` tal cual. `status='void'` conserva la fila (no se borra).

### 5.3 Orden y alcance de cada corrida

1. Contactos (clientes y proveedores) — barrido completo; se salta la escritura cuando `updated_at` de Alegra ≤ el guardado.
2. Ítems — barrido completo (50 páginas). Crea/actualiza/desactiva. Guarda `updated_at` de Alegra si viene.
3. Stock — plan + aplicación (solo con `--apply`).
4. Facturas — `--full`: todo el histórico (500 páginas ≈ 4 min); incremental: `date_afterOrNow = hoy − 3 días` **más** todas las `status=open` (para saldos) y las `void` de los últimos 30 días.
5. Registro en `alegra_sync_runs` (siempre, también en dry-run y en fallo).

Un fallo en una entidad se anota y **no detiene** las demás. 429 → esperar `X-Rate-Limit-Reset`. 5xx → 3 reintentos con espera creciente. Si Alegra devuelve 401 → abortar y marcar `ok=false` con mensaje «token inválido» (nunca desactivar nada con datos a medias). **Guardia anti-vacío:** si un barrido completo devuelve menos del 50 % de los registros de la corrida anterior, no se desactiva nada y se marca error.

## 6. Pantallas (v1, mínimas)

- **Configuración → Integraciones → Alegra:** última corrida (fecha, ok/fallo, conteos), botón «Sincronizar ahora» (dispara el workflow; deshabilitado si hay una corrida en curso), aviso «Alegra manda: precios, costos y stock se pisan cada mañana».
- **Ficha del cliente → pestaña «Compras»:** lista de `alegra_invoices` del cliente (fecha, NCF, sucursal, total, saldo) con detalle de líneas.
- **Reportes → «Ventas Alegra»:** filtro por rango y sucursal; totales por día, por producto y por vendedor; exportar Excel con el motor existente.
- **Cuentas por cobrar → sección «Saldos en Alegra»:** facturas `open` con `balance > 0`, por cliente, con antigüedad.

## 7. Pruebas

- Unitarias (vitest): cliente HTTP (paginación, 429/`Reset`, reintentos, nunca métodos distintos de GET — test que falla si el cliente expone POST/PUT/DELETE); cada mapeo; el diff de productos (crear/actualizar/desactivar, guardia anti-vacío); el matcher de contactos con los casos reales (teléfono con guiones, ficha más antigua, sin datos → crear); armado de `AlegraRow[]` desde `warehouses`.
- Fixtures: JSON anonimizados tomados de la API el 2026-09-05 (ítem Elta MD UV Sport, contacto con teléfono, factura B02 con 2 líneas y pago).
- En vivo (solo lectura): `scripts/test/alegra-live-test.mjs` — autentica, lee 1 página de cada recurso y valida el esquema esperado; se corre antes de cada `--apply`.
- Dry-run completo contra producción y revisión de conteos antes del primer `--apply`; respaldo (`rest-json-backup.mjs`) antes.

## 8. Riesgos y mitigaciones

- **Duplicar clientes** (6 478 vs 4): matching por teléfono/correo/documento + `alegra_id`; nunca por nombre solo. Los que Alegra tiene duplicados entre sí se traen tal cual (Alegra manda).
- **Pisar precios editados a mano:** decisión 6; aviso en la UI; el diff registra en `counts.priceChanged` cuántos cambiaron y el reporte los lista.
- **Stock «vuelve» si no se factura en Alegra:** decisión 3; la pantalla de integración lo dice en grande.
- **Token caduca / plan de Alegra:** 401 → corrida marcada en rojo, correo de fallo de GitHub Actions; nada se desactiva.
- **Tope 10 000 en `metadata.total`:** nunca se usa el total para cortar; se pagina hasta página incompleta.
- **Vencimientos provisionales** en lotes creados por el sync: igual que hoy; se documenta.

## 9. Fuera de alcance (v1)

Escritura hacia Alegra; webhooks; pagos como entidad aparte (los saldos salen de la factura); compras/facturas de proveedor; notas de crédito como documento propio (una factura `void` basta); reconciliación contable.

## 10. Entregas (orden)

1. Migración + cliente HTTP + mapeos + script con `--dry-run` (contactos, ítems, facturas) y `alegra_sync_runs`. Dry-run completo revisado con el dueño.
2. `--apply`: carga inicial (contactos, productos, stock, histórico de facturas). Verificación releyendo la base.
3. Workflow diario + disparo manual + pantalla de integración.
4. Pestaña «Compras», reporte «Ventas Alegra», «Saldos en Alegra».
