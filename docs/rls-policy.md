# DermaLand · Política de RLS multiempresa

> Cómo garantizamos que un usuario del business A NUNCA vea un row del business B.
> Riesgo de referencia: **R-SEC-01** en `riesgos.md`.

## Modelo

Cada tabla operativa lleva la columna `business_id uuid not null`. La policy RLS estándar es:

```sql
create policy <table>_all on <table> for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());
```

donde `auth_business_id()` lee el claim `business_id` del JWT firmado por Supabase Auth.

## Helpers SQL

Definidos en `supabase/migrations/0001_phase1_core.sql`:

```sql
auth_business_id()        → uuid del business del usuario actual (del JWT)
auth_is_platform_admin()  → boolean: true para súper admin
```

## Tablas con RLS habilitado (Fases 1 y 2)

| Tabla | Policy | Quién puede leer | Quién puede escribir |
|-------|--------|------------------|----------------------|
| `businesses` | self-or-admin | Tu business o súper admin | Tu business (update) o súper admin (all) |
| `branches` | scoped | Tu business | Tu business |
| `warehouses` | scoped | Tu business | Tu business |
| `users` | scoped | Tu business | Tu business |
| `audit_logs` | scoped (read-only) | Tu business | Solo via service-role + verificación explícita |
| `brands`, `laboratories`, `product_categories` | scoped | Tu business | Tu business |
| `products` | scoped | Tu business | Tu business |
| `product_lots` | scoped | Tu business | Tu business |
| `inventory_movements` | scoped | Tu business | Tu business |
| `inventory_counts` + scans/items/evidence/sync_logs | scoped | Tu business | Tu business |
| `lot_quarantine`, `lot_recalls` | scoped | Tu business | Tu business |
| `plans` | global read | Cualquiera autenticado | Solo súper admin |
| `platform_users` | admin only | Solo súper admin | Solo súper admin |

## Setup en Supabase Auth

Los claims `business_id`, `branch_id`, `role`, `is_platform_admin` deben inyectarse al JWT en el **trigger** `auth.users` → `public.users` o vía un Edge Function de auth hook.

Patrón: al crear/actualizar `auth.users`, leer `public.users.business_id` y setearlo en `raw_app_meta_data`. Supabase Auth los expone en el JWT como custom claims.

```sql
-- Ejemplo trigger (incluir en migración futura):
create or replace function set_business_claim()
  returns trigger
  language plpgsql
  security definer
  as $$
declare
  v_biz uuid;
  v_role text;
  v_branch uuid;
begin
  select business_id, role, branch_ids[1]
    into v_biz, v_role, v_branch
    from public.users where id = new.id;

  update auth.users
    set raw_app_meta_data = raw_app_meta_data ||
      jsonb_build_object(
        'business_id', v_biz,
        'role', v_role,
        'branch_id', v_branch
      )
    where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update on auth.users
  for each row execute function set_business_claim();
```

## Defensa en profundidad

RLS es la última línea — pero cada repo Supabase **también** filtra por `business_id`:

```ts
const { data } = await sb
  .from("products")
  .select("*")
  .eq("business_id", ctx.businessId);  // ← redundante pero a propósito
```

Si por error se desactiva una policy o se usa `service_role` sin querer, el filtro explícito sigue protegiendo. Esto está documentado en `src/server/repositories/types.ts`.

## Service-role usage

`SUPABASE_SERVICE_ROLE_KEY` bypassea RLS. Solo se usa en:

1. **Edge Functions / Server Actions** específicas (DGII signing, WhatsApp webhook, AI tools).
2. **Súper admin operations** con auditoría explícita (impersonation, suspender business).
3. **Scripts CLI / migrations**.

NUNCA en client components. NUNCA expuesta en variables `NEXT_PUBLIC_*`.

## Auditoría obligatoria

Todas las acciones sensibles deben loggearse en `audit_logs` con:
- `user_id`, `user_name`
- `action` (formato `entity.verb` — ej. `proforma.cancel`, `inventory_count.approve`)
- `entity` y `entity_id`
- `metadata` con contexto relevante
- `ip_address`

Inserción se hace via service-role + verificación explícita de `business_id` en el server action.

## Tests obligatorios

Antes de cada release a producción correr el **cross-tenant isolation test** (ver `docs/testing.md`):

1. Crear businesses A y B con datos.
2. Loginearse como usuario de A.
3. Intentar leer cada tabla con `business_id = B`. **Debe devolver 0 rows**.
4. Intentar escribir con `business_id = B`. **Debe fallar con RLS error**.

Repetir para todas las tablas operativas listadas arriba. CI bloquea merge si falla.
