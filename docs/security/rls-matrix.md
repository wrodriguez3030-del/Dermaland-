# Matriz RLS — DermaLand

Verificado por MCP contra la BD real (proyecto `sntcvyozbhrgicwmtcoh`) el
2026-07-12. **56/56 tablas de `public` tienen RLS habilitado.**

## Patrón canónico (tablas de tenant)

La gran mayoría de las tablas usan **una política `ALL`** (SELECT+INSERT+UPDATE+
DELETE) con:

```
USING      ( business_id = (select auth_business_id()) )
WITH CHECK ( business_id = (select auth_business_id()) )
```

`auth_business_id()` deriva el tenant del JWT — tras SEC-001, **solo** de claim
raíz o `app_metadata` (no `user_metadata`). Ningún cliente puede enviar/sustituir
`business_id`. Prueba cross-tenant: una consulta de la empresa A con el JWT de A
nunca ve filas de B (intersección vacía).

| Grupo de tablas | RLS | Campo tenant | Política | Cross-tenant |
|---|---|---|---|---|
| Catálogo/negocio: `products`, `product_lots`, `product_categories`, `brands`, `laboratories`, `warehouses`, `payment_methods`, `invoice_numberings`, `ecf_sequences` | ✅ | `business_id` | ALL por `auth_business_id()` | Bloqueado |
| Ventas/caja: `proformas`, `proforma_items`, `proforma_payments`, `cash_*` (7), `electronic_invoices(+items)`, `proforma_to_ecf_logs` | ✅ | `business_id` | ALL | Bloqueado |
| Inventario: `inventory_movements`, `inventory_count*` (5), `lot_quarantine`, `lot_recalls` | ✅ | `business_id` | ALL | Bloqueado |
| Clientes/personas: `clients` (4 pol.), `users` (4 pol.) | ✅ | `business_id` | por operación | Bloqueado |
| Comisiones/incentivos: `commission_*` (5), `sales_commission_rules`, `sales_incentive*` (2+1) | ✅ | `business_id` | ALL | Bloqueado |
| DGII: `dgii_*` (6), `dgii_certificates` | ✅ | `business_id` | ALL | Bloqueado |
| IA: `ai_providers`, `ai_provider_secrets`, `ai_agent_provider_bindings`, `ai_usage_logs` | ✅ | `business_id` | ALL | Bloqueado |
| Tenancy: `businesses` (4 pol.), `branches` (4 pol.) | ✅ | `id`/`business_id` | por operación | Bloqueado |
| Auditoría: `audit_logs` (2 pol.) | ✅ | `business_id` | SELECT tenant / INSERT | Bloqueado |
| Plataforma: `platform_users` | ✅ | — | admin de plataforma | n/a |

## Catálogos globales (SELECT abierto a propósito)

| Tabla | RLS | SELECT | Escrituras |
|---|---|---|---|
| `permissions` | ✅ | `USING(true)` (catálogo de permisos, igual para todos) | denegadas (sin política) |
| `roles` | ✅ | `USING(true)` | denegadas |
| `role_permissions` | ✅ | `USING(true)` | denegadas |
| `plans` | ✅ | `USING(true)` (planes de suscripción) | solo `auth_is_platform_admin()` |

Estos `USING(true)` son **correctos**: son datos de referencia no sensibles por
tenant, y las escrituras están denegadas o restringidas a platform admin.

## Funciones de seguridad

- `auth_business_id()` / `auth_is_platform_admin()`: `LANGUAGE sql STABLE`,
  `search_path` fijo a `public, auth, extensions`, **NO** `SECURITY DEFINER`.
- **0 funciones `SECURITY DEFINER`** en `public`.

## Estado de pruebas cross-tenant

- **Estructural (verificado):** patrón `business_id = auth_business_id()` en todas
  las tablas de tenant; el tenant no es sustituible por el cliente (tras SEC-001).
- **Dinámico (pendiente):** prueba e2e con dos JWT de empresas distintas. Hoy solo
  hay 1 empresa (`…d001`) y 2 usuarios, ambos de esa empresa; no es posible una
  prueba cross-tenant real hasta onboardear una 2ª empresa. Recomendado antes de
  go-live multi-tenant (ver checklist).
