# B-07 — Reparación del historial de migraciones (normalizar a NNNN)

**Fecha:** 2026-07-17
**Estado:** Diseño aprobado (alcance: normalización completa a NNNN)
**Severidad del item:** Baja (auditabilidad / higiene; no bloquea el piloto)
**Proyecto Supabase:** `sntcvyozbhrgicwmtcoh` (DermaLand producción)

## Problema

El historial de migraciones de producción está desalineado respecto a los archivos
locales. Dos defectos distintos:

1. **Registro incompleto.** 12 migraciones aplicadas en prod (vía SQL Editor) nunca
   dejaron fila de tracking en `supabase_migrations.schema_migrations`:
   `0007, 0008, 0009, 0011, 0015, 0016, 0017, 0018, 0019, 0020, 0021, 0022`.
   Además existe **1 migración "fantasma"** rastreada en remoto sin archivo local:
   `ai_providers_module` (aplicada por MCP `apply_migration`; su DDL quedó guardado en
   la columna `statements`).

2. **Formato inconsistente.** Las 22 filas ya rastreadas usan **versión = timestamp**
   de Supabase (`20260519205421`, …), pero los archivos usan la convención humana del
   proyecto `NNNN_nombre.sql`. Aunque estén "rastreadas", `supabase migration list` no
   las alinea y `supabase db push` sería inseguro (interpretaría los archivos como
   pendientes y podría reaplicarlos).

## Estado actual (medido)

| | Cantidad |
|---|---|
| Archivos locales (`supabase/migrations/*.sql`) | 33 (`0001`…`0032` + `0002a`) |
| Filas en `schema_migrations` | 22 (versión = timestamp) |
| Locales sin rastrear | 12 |
| Fantasma remota sin archivo local | 1 (`ai_providers_module`) |

Estructura de `supabase_migrations.schema_migrations`:
`version (text, PK)`, `statements (text[])`, `name (text)`, `created_by (text)`,
`idempotency_key (text)`, `rollback (text[])`. **Ninguna FK referencia `version`** →
reescribir `version` es seguro (metadata interna).

## Objetivo (end-state)

`schema_migrations` con **34 filas ↔ 34 archivos locales**, todas con versión en
formato `NNNN` (con sufijo de letra donde aplica, p. ej. `0002a`, `0025a`), alineadas
1:1 por versión y por `name` = base del nombre de archivo. Resultado:
`supabase migration list` limpio y `db push` seguro.

## Mapa de reparación

### A. Reconstruir la migración fantasma como archivo local
- `ai_providers_module` (versión remota `20260711182946`) se aplicó entre `0025`
  (`20260711031558`) y `0026`/sec001 (`20260712…`). No hay hueco entero en la secuencia
  → se numera **`0025a`** (siguiendo el precedente `0002a_clients`).
- Crear `supabase/migrations/0025a_ai_providers_module.sql` con el DDL reconstruido
  desde `schema_migrations.statements` de esa fila (1 statement guardado).

### B. Verificación de existencia (gate de seguridad — obligatorio)
Antes de insertar la fila de tracking de cada una de las 12 sin rastrear, **verificar
que sus objetos existan realmente en prod** (tablas / columnas / policies / seeds
según lo que crea cada migración). Regla dura: **si algún objeto falta, se DETIENE y se
reporta — nunca se marca como "aplicada" una migración cuyo efecto no está presente.**

Objeto(s) a verificar por migración (se confirma leyendo cada `.sql`):

| Migración | Verificación principal |
|---|---|
| `0007_audit_logs_insert_policy` | policy de INSERT sobre `audit_logs` en `pg_policies` |
| `0008_security_advisor_fixes` | fix(es) de `search_path`/policies del advisor presentes |
| `0009_rls_initplan_remaining` | policies reescritas (initplan) presentes |
| `0011_invoice_numberings` | tabla/columnas de numeración de facturas |
| `0015_cash_movements` | tabla `cash_movements` |
| `0016_laboratories_seed` | filas seed en `laboratories` |
| `0017_backfill_product_laboratories` | `products.laboratory_id` poblado (backfill) |
| `0018_pos_numbering_wiring` | wiring de numeración POS presente |
| `0019_sale_seller` | columna `seller`/vendedor en ventas |
| `0020_sales_incentives` | tabla `sales_incentives` |
| `0021_users_vendedor_role` | rol/permiso vendedor sembrado |
| `0022_customer_sales_relations` | relaciones/FK cliente↔ventas |

### C. Reparar el tracking (solo DML sobre `schema_migrations`, vía `execute_sql`)
> **No usar `apply_migration`**: ese tool ejecuta DDL y añade su propia fila de
> tracking (ruido). La reparación es puro INSERT/UPDATE de metadata.

1. **Respaldo previo:** `create table supabase_migrations._schema_migrations_bak_b07
   as select * from supabase_migrations.schema_migrations;` (rollback trivial).
2. **UPDATE (22 filas):** reescribir `version` de timestamp → `NNNN` y `name` → base
   del archivo, mapeando por el `name`/versión actual. El espacio `NNNN` es disjunto del
   espacio timestamp → **sin colisiones de PK** en ningún punto.
3. **INSERT (12 filas):** una por cada migración verificada en (B). `version = 'NNNN'`,
   `name =` base del archivo, `statements = NULL` (aplicada fuera de banda; el DDL vive
   en el `.sql`), `created_by = 'b07-migration-repair'`.
4. La fila fantasma pasa de `20260711182946` → `0025a`, `name = 0025a_ai_providers_module`.

### Mapa versión-timestamp → NNNN (22 UPDATEs)
`0001..0006` (phase1_core, phase2_inventory, 0002a_clients, dgii_pos,
dgii_permissions_seed, dgii_role_permissions_seed, auth_helpers_jwt_metadata),
`ai_providers_module→0025a`, `sec001…→0026`, `sec010_011…→0027`, `lot_qty_nonneg_check→0028`,
`atomic_sale_and_void→0029`, `apply_count_adjustments→0030`, `accounts_receivable→0031`,
`create_inventory_transfers_tables→0010`, `transfer_stock_atomic→0032`,
`purchases_module→0012`, `pos_favorites_line_discount→0013`, `billing_settings_ecf→0014`,
`commission→0023`, `commission_unify→0024`, `products_soft_delete_unique→0025`.

## Verificación final

1. `count(*) = 34` filas en `schema_migrations`; todas con `version ~ '^[0-9]{4}[a-z]?$'`.
2. Conjunto de versiones remotas == conjunto de prefijos `NNNN` de los 34 archivos
   locales (0 huérfanos en ambas direcciones).
3. `typecheck` 0, suite de tests verde (el cambio no toca código de app; solo se agrega
   `0025a_*.sql`, que los tests no ejecutan).
4. Actualizar `docs/production-readiness-report.md` (B-07 → CERRADO), memoria
   `dermaland-migration-drift`, `CHANGELOG.md`, bump de versión (patch), commit y push a
   Gitea (`ARB/dermaland`) siguiendo CONTRIBUTING.

## Riesgos y mitigación

- **Reescribir PK `version`:** metadata interna sin FKs → riesgo bajo; respaldo en
  `_schema_migrations_bak_b07` permite revertir con un `truncate`+`insert`.
- **Marcar como aplicada algo ausente:** mitigado por el gate B (verificación de
  existencia por objeto; se detiene si falta).
- **Recurrencia:** el drift se originó por aplicar DDL por SQL Editor (sin tracking) y
  por MCP (timestamp). Nota de proceso en el reporte: en adelante, aplicar migraciones
  por una sola vía y registrar la fila con versión `NNNN`.

## Fuera de alcance (YAGNI)

- Renombrar archivos a convención timestamp de Supabase (se elige NNNN, ya es la del
  proyecto).
- Automatizar un hook de CI que valide alineación (se puede proponer aparte).
- Cualquier otro bloqueador del piloto (B-01, B-04) — no seleccionados.
