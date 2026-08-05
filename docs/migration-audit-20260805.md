# Auditoria de migraciones — 2026-08-05

> Generado por `scripts/audit-migrations.mjs`. Clasifica **por objeto**, no
> por nombre: el historial no es fuente de verdad.

| Archivo | Veredicto | Objetos | En historial | Faltantes |
|---|---|---|---|---|
| `0001_phase1_core` | PARCIAL | 25 | si | policy:plans.plans_admin, policy:businesses.businesses_select, policy:businesses.businesses_admin_all, policy:businesses.businesses_self_update, policy:branches.branches_select, policy:branches.branches_write, policy:users.users_select, policy:users.users_admin_write |
| `0002_phase2_inventory` | PARCIAL | 34 | si | index:products_barcode_unique |
| `0002a_clients` | PARCIAL | 6 | si | policy:clients.clients_select, policy:clients.clients_write |
| `0003_dgii_pos` | APLICADA | 59 | si | — |
| `0004_dgii_permissions_seed` | APLICADA | 2 | si | — |
| `0005_dgii_role_permissions_seed` | APLICADA | 4 | si | — |
| `0006_auth_helpers_jwt_metadata` | APLICADA | 2 | si | — |
| `0007_audit_logs_insert_policy` | APLICADA | 1 | **NO** | — |
| `0008_security_advisor_fixes` | APLICADA | 20 | **NO** | — |
| `0009_rls_initplan_remaining` | INDETERMINADA | 0 | **NO** | — |
| `0010_inventory_transfers` | APLICADA | 7 | **NO** | — |
| `0011_invoice_numberings` | APLICADA | 5 | **NO** | — |
| `0012_purchases` | APLICADA | 18 | **NO** | — |
| `0013_pos_favorites_line_discount` | APLICADA | 5 | si | — |
| `0014_billing_settings_ecf` | APLICADA | 15 | si | — |
| `0015_cash_movements` | APLICADA | 3 | **NO** | — |
| `0016_laboratories_seed` | INDETERMINADA | 0 | **NO** | — |
| `0017_backfill_product_laboratories` | INDETERMINADA | 0 | **NO** | — |
| `0018_pos_numbering_wiring` | APLICADA | 2 | **NO** | — |
| `0019_sale_seller` | APLICADA | 3 | **NO** | — |
| `0020_sales_incentives` | APLICADA | 8 | **NO** | — |
| `0021_users_vendedor_role` | INDETERMINADA | 0 | **NO** | — |
| `0022_customer_sales_relations` | APLICADA | 4 | **NO** | — |
| `0023_commission` | APLICADA | 15 | si | — |
| `0024_commission_unify` | APLICADA | 11 | si | — |
| `0025_products_soft_delete_unique` | APLICADA | 2 | si | — |
| `0026_sec001_auth_helpers_appmeta_only` | APLICADA | 2 | si | — |
| `0027_sec010_011_atomic_stock_idempotency` | APLICADA | 3 | si | — |
| `0028_lot_qty_nonneg_check` | INDETERMINADA | 0 | si | — |
| `0029_atomic_sale_and_void` | APLICADA | 4 | si | — |
| `0030_apply_count_adjustments` | APLICADA | 1 | si | — |
| `0031_accounts_receivable` | APLICADA | 12 | si | — |
| `0032_transfer_atomic` | APLICADA | 1 | **NO** | — |
| `0033_laboratory_shelf_life` | APLICADA | 1 | si | — |
| `0034_email_settings` | APLICADA | 2 | si | — |
| `0035_dl14_function_search_path` | INDETERMINADA | 0 | si | — |
| `0036_storefront_web_catalog` | APLICADA | 10 | si | — |
| `0037_client_auth_links` | APLICADA | 4 | si | — |
| `0038_web_orders` | APLICADA | 11 | si | — |
| `0039_web_order_payment_columns` | APLICADA | 4 | si | — |
| `0040_shipping_rates` | APLICADA | 7 | si | — |
| `0041_transfer_payments` | APLICADA | 8 | si | — |
| `0042_client_identity_normalized` | APLICADA | 8 | si | — |
| `0043_branch_web_fulfillment` | APLICADA | 2 | si | — |
| `0044_client_phone_uniform_format` | INDETERMINADA | 0 | **NO** | — |
| `0045_ecf_idempotency_and_events` | APLICADA | 13 | si | — |
| `0046_dgii_xml_storage` | APLICADA | 1 | si | — |

## Sin archivo local (agujero real)

Registros del historial que no corresponden a NINGUN `.sql` del repositorio
— ni por nombre ni por los objetos que declaran. Estos son la evidencia de
que se aplico algo a produccion sin dejar rastro reconstruible.

- `ai_providers_module` (version `20260711182946`)
- `product_images_storage_bucket` (version `20260803010512`)
- `0042_payments_azul` (version `20260804195156`)
- `ecf_events_fk_restrict` (version `20260805020813`)

## Registrado bajo otro nombre (cosmetico)

Registros del historial que SI tienen un `.sql` local — Supabase los
registro con el nombre de una tabla o funcion en vez del nombre del
archivo. Emparejados por similitud de objetos (Jaccard >= 0.5 Y al
menos 2 objetos en comun — un solo objeto en comun, por mas
perfecto que sea el jaccard, no es evidencia suficiente por si sola; ver
seccion Dudosos y el comentario en el codigo). No representan un
agujero: NO proponer `repair` para estos, ya estan registrados (solo que
con otro nombre).

- `create_inventory_transfers_tables` (version `20260716203725`) → `0010_inventory_transfers` (jaccard 1.00, 7/7 objetos)
- `purchases_module` (version `20260716213445`) → `0012_purchases` (jaccard 1.00, 18/18 objetos)

## Dudosos (evidencia insuficiente — revisar a mano)

Registros que superan el umbral de similitud (Jaccard >= 0.5) contra
algun archivo local sin registro, pero con MENOS de 2 objetos en
comun — muy poca base para confirmar un renombrado. Un jaccard perfecto
sobre un solo objeto tambien lo daria un hotfix aplicado a produccion sin
dejar `.sql` que por casualidad declara el mismo objeto (la forma de
drift MAS COMUN de este repositorio). NO se cuentan como renombrado NI
como huerfano: ni se asumen resueltos ni se pierden de vista. Decide un
humano, no el script.

- `transfer_stock_atomic` (version `20260716203746`) → ¿`0032_transfer_atomic`? (jaccard 1.00, 1/1 objetos — insuficiente, minimo 2)

## Archivo sin registro (contabilidad)

Archivos locales que no aparecen en el historial bajo ningun nombre (ni el
suyo ni un renombrado detectado arriba). No es un agujero: casi todos ya
estan `APLICADA` de verdad, solo falta que el historial lo sepa.

- `0007_audit_logs_insert_policy` → APLICADA
- `0008_security_advisor_fixes` → APLICADA
- `0009_rls_initplan_remaining` → INDETERMINADA
- `0011_invoice_numberings` → APLICADA
- `0015_cash_movements` → APLICADA
- `0016_laboratories_seed` → INDETERMINADA
- `0017_backfill_product_laboratories` → INDETERMINADA
- `0018_pos_numbering_wiring` → APLICADA
- `0019_sale_seller` → APLICADA
- `0020_sales_incentives` → APLICADA
- `0021_users_vendedor_role` → INDETERMINADA
- `0022_customer_sales_relations` → APLICADA
- `0032_transfer_atomic` → APLICADA
- `0044_client_phone_uniform_format` → INDETERMINADA

## Reparacion del historial — NINGUN COMANDO EJECUTABLE PROPUESTO

**El proyecto NO esta `linked`** (no existe `supabase/.temp`). Sin
eso, `supabase migration repair` exige `--db-url` o `-p/--password` como
argumento en la linea de comandos — y eso deja la contraseña de
produccion en el historial del shell. Forma segura antes de reparar nada:

```bash
supabase link --project-ref sntcvyozbhrgicwmtcoh
# pide un access token interactivo — nunca la contraseña de Postgres.
supabase migration repair --status applied <version> --linked
# NUNCA: supabase migration repair ... --db-url "postgresql://..." con
# la cadena pegada literal. Si hiciera falta --db-url, pasarlo como
# variable de entorno ya exportada: --db-url "$SUPABASE_DB_URL".
```

**Las versiones de `supabase_migrations.schema_migrations` son
timestamps de 14 digitos** (ej. `20260805020813`). Los archivos locales
de este repo usan un numero de secuencia de 4 digitos (`0007`, `0008`,
...) que NO es una version valida para `repair` — un comando con ese
numero fallaria o, peor, registraria una version que no significa nada.
Para las migraciones `APLICADA` sin fila en el historial no hay ninguna
fuente confiable de CUANDO se aplicaron realmente (por definicion: si la
hubiera, tendrian fila). Inventar un timestamp seria un `repair` mal
formado contra produccion — peor que no proponer nada. Por eso este
reporte NO emite comandos: falta que un humano decida que version
asignarle a cada una (o acepte una version "de documentacion", con el
entendido de que no refleja cuando se aplico de verdad).

- `0007_audit_logs_insert_policy` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0008_security_advisor_fixes` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0011_invoice_numberings` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0015_cash_movements` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0018_pos_numbering_wiring` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0019_sale_seller` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0020_sales_incentives` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0022_customer_sales_relations` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.
- `0032_transfer_atomic` → APLICADA, sin fila en el historial. Falta decidir su version de 14 digitos antes de poder correr `repair`.

**Requieren decision humana** (no se propone comando):

- `0001_phase1_core` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0002_phase2_inventory` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0002a_clients` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0009_rls_initplan_remaining` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0016_laboratories_seed` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0017_backfill_product_laboratories` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0021_users_vendedor_role` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0044_client_phone_uniform_format` → INDETERMINADA. Revisar a mano antes de tocar el historial.
