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

## Registros en la base sin archivo local

- `ai_providers_module` (version `20260711182946`)
- `create_inventory_transfers_tables` (version `20260716203725`)
- `transfer_stock_atomic` (version `20260716203746`)
- `purchases_module` (version `20260716213445`)
- `product_images_storage_bucket` (version `20260803010512`)
- `0042_payments_azul` (version `20260804195156`)
- `ecf_idempotency_and_events` (version `20260805020706`)
- `ecf_events_fk_restrict` (version `20260805020813`)
- `dgii_xml_storage` (version `20260805131840`)

> Estos son el agujero real: se aplicaron sin dejar `.sql` en el repositorio,
> asi que `supabase/migrations/` ya no reconstruye el esquema desde cero.

## Comandos de reparacion propuestos — NO EJECUTADOS

```bash
supabase migration repair --status applied 0007
supabase migration repair --status applied 0008
supabase migration repair --status applied 0010
supabase migration repair --status applied 0011
supabase migration repair --status applied 0012
supabase migration repair --status applied 0015
supabase migration repair --status applied 0018
supabase migration repair --status applied 0019
supabase migration repair --status applied 0020
supabase migration repair --status applied 0022
supabase migration repair --status applied 0032
```

**Requieren decision humana** (no se propone comando):

- `0001_phase1_core` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0002_phase2_inventory` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0002a_clients` → PARCIAL. Revisar a mano antes de tocar el historial.
- `0009_rls_initplan_remaining` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0016_laboratories_seed` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0017_backfill_product_laboratories` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0021_users_vendedor_role` → INDETERMINADA. Revisar a mano antes de tocar el historial.
- `0044_client_phone_uniform_format` → INDETERMINADA. Revisar a mano antes de tocar el historial.
