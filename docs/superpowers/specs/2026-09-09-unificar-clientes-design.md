# Unificar clientes — Diseño

**Fecha:** 2026-09-09 · **Aprobado por el dueño** (lista automática de posibles duplicados)

## El problema

6,521 de los 6,525 clientes vienen de la migración de Alegra. Es muy probable
que haya varios duplicados repartidos por todo el listado (mismo teléfono,
documento o nombre con fichas distintas), y no hay forma de fusionarlos hoy:
cada duplicado divide el historial de compras, CxC y pedidos de esa persona
en dos fichas separadas.

## La decisión

Un botón **"Unificar clientes"** en `/clientes` (solo admin/super_admin) que
lleva a una pantalla que **ya escaneó** el catálogo y muestra los pares
sospechosos. El admin elige cuál sobrevive; todo lo del otro se traspasa y el
duplicado queda eliminado (soft-delete), igual que "Eliminar cliente" hoy.

## Diseño

### 1. Detección (reutiliza lógica ya existente y probada)

`findPotentialDuplicateClients` (`features/customers/utils/duplicate-detection.ts`)
ya compara UN candidato contra una lista — hoy se usa al crear un cliente
nuevo. Para escanear los 6,525 entre sí (evitar O(n²) = ~21M comparaciones):

- Nueva función pura `scanAllDuplicates(clients)` en el mismo módulo:
  agrupa clientes en "cubos" por documento normalizado, teléfono
  normalizado y WhatsApp normalizado (un cliente puede caer en varios
  cubos), y dentro de cada cubo (típicamente 2-5 fichas) corre
  `findPotentialDuplicateClients` — mismas reglas de confianza (alta/media),
  sin reinventar el criterio.
- Cada par se reporta UNA vez (par ordenado por id para deduplicar), con su
  `confidence` y `reasons` ya calculados.
- Corre en el SERVIDOR (`GET /api/customers/duplicates`, admin-only): trae
  todos los clientes activos del negocio (paginando con `fetchAllPages`,
  igual que otras rutas — 6,525 > el corte de 1000 de PostgREST) y devuelve
  los pares. No se recalcula en cada visita a la pantalla si no cambió nada
  reciente: sin caché en v1 (YAGNI — se revisa si tarda demasiado en la
  práctica).

### 2. Pantalla `/clientes/unificar` (admin-only)

- Gate: `puedeAccionDeRiesgo(useCurrentRole())` — igual que "Eliminar
  cliente"/"Editar cliente" en `/clientes` hoy. Sin el permiso, 404 (mismo
  patrón que otras pantallas admin-only de la casa).
- Lista de pares, ordenados por confianza (alta primero), con: nombre,
  teléfono, documento, compras, total gastado de cada lado (reutiliza
  `CustomerMetricsRow` si el costo de traerlo para cada par no es alto;
  si lo es, se difiere al abrir el par).
- Al abrir un par: comparación lado a lado de los campos que difieren
  (teléfono, documento, email, nombre, dirección) + un resumen de cuánto se
  mueve ("14 facturas migradas, 3 promesas de pago, 1 pedido web") — pedido
  al servidor en modo *dry run* antes de confirmar.
- El admin elige el sobreviviente (preseleccionado: el de más compras). Un
  botón "Unificar" abre el `ConfirmDialog` ya usado por "Eliminar cliente",
  con el resumen de arriba en el mensaje.
- Después de unificar, el par desaparece de la lista (sin recargar todo el
  escaneo).

### 3. Backend: `POST /api/customers/merge`

Body `{ primaryId, duplicateId, dryRun?: boolean }`. Rol requerido:
`puedeAccionDeRiesgo` (mismo criterio que servidor de "Eliminar cliente" —
la guarda de INTERFAZ de arriba NO es la única barrera).

- **`dryRun: true`** — cuenta cuántas filas de cada tabla se moverían (sin
  escribir). Es lo que alimenta el resumen de la pantalla de comparación.
- **`dryRun` ausente/false** — llama a la función SQL `merge_clients` (nueva
  migración, mismo patrón que `emit_sale_atomic`/`void_sale_atomic`:
  `security invoker`, transaccional, filtra `business_id` en cada tabla):
  1. Verifica que `primaryId`/`duplicateId` existen, pertenecen al mismo
     `business_id` y ninguno está ya borrado.
  2. Repunta las 7 tablas con FK a `clients` del duplicado al sobreviviente:
     `alegra_invoices.client_id`, `ar_promises.client_id`,
     `client_auth_links.client_id`, `electronic_invoices.customer_id`,
     `electronic_invoices_legacy_20260906.customer_id`,
     `proformas.customer_id`, `web_orders.client_id`. Ninguna de las 7 tiene
     un índice único sobre esa columna (verificado contra la base real) —
     no hay riesgo de choque de unicidad al reasignar en bloque.
  3. Rellena en el sobreviviente los campos que le falten
     (teléfono/whatsapp/email/documento/fecha de nacimiento/dirección) con
     los del duplicado — `coalesce`, nunca sobreescribe un dato que el
     sobreviviente ya tenía.
  4. Marca el duplicado `deleted_at = now()` (mismo soft-delete que
     "Eliminar cliente" — no se borra físicamente).
  5. Devuelve los conteos movidos (misma forma que el dry run).
- Auditoría: `audit_logs` con acción `customer.merge`, metadata con
  `primaryId`, `duplicateId` y los conteos — mismo patrón que
  `sale.update_full`/`user.mfa_break_glass`.

### 4. Fuera de alcance (v1)

- Unificar de a **un par a la vez**. Si un cliente aparece en varios pares,
  se repite la acción — nada de grupos de 3+ en una sola operación.
- Editar campo por campo durante la unificación (solo "rellenar huecos" del
  sobreviviente; para cambiar algo más se edita el cliente después, como
  hoy).
- Deshacer: es la misma irreversibilidad que ya tiene "Eliminar cliente".
- Caché/optimización del escaneo si tarda — se mide primero contra la base
  real.
