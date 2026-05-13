# DermaLand · Setup Supabase

Cómo activar el backend real cuando estés listo para reemplazar mock data.

## 1. Crear proyecto

1. https://supabase.com → New project.
2. Nombre: `dermaland-prod` (o `dermaland-staging`).
3. Región: `us-east-1` (más cercana a RD).
4. Plan: **Free** para staging · **Pro** para producción (PITR 7 días).
5. Apuntar password a 1Password.

## 2. Aplicar migraciones

```powershell
# Instalar CLI si no está
pnpm dlx supabase --version

# Login una vez por máquina
pnpm dlx supabase login

# Vincular proyecto
pnpm dlx supabase link --project-ref <project-id>

# Aplicar migraciones (en orden)
pnpm dlx supabase db push
```

Las migraciones viven en `supabase/migrations/`:
- `0001_phase1_core.sql` — businesses, branches, users, audit_logs, plans
- `0002_phase2_inventory.sql` — productos, lotes, conteos físicos, FEFO

Cada nueva fase agrega `0003_phase3_*.sql`, etc.

## 3. Generar tipos TypeScript

```powershell
pnpm dlx supabase gen types typescript --project-id <project-id> > apps/web/src/server/db/database.types.ts
```

Sobreescribe el placeholder. Re-ejecutar tras cada migración.

## 4. Configurar `.env`

```
DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   # ← solo server, no commitear
DATABASE_URL=postgresql://postgres:<pwd>@db.<project>.supabase.co:5432/postgres
```

## 5. JWT custom claims (trigger)

Para que las policies RLS lean `business_id` del JWT, instalar el trigger:

```sql
-- Ver docs/rls-policy.md → sección "Setup en Supabase Auth"
create or replace function set_business_claim() ...
```

## 6. Verificar RLS

Login con un usuario de business A:
```sql
select * from products;        -- debe ver solo del business A
select * from products where business_id = '<biz_b_id>';  -- 0 rows
```

Si ves rows de B, alguna policy falta. Ejecutar:
```sql
select tablename, policyname from pg_policies where schemaname = 'public';
```
y comparar contra `docs/rls-policy.md`.

## 7. Implementar repos Supabase

`src/server/repositories/supabase/index.ts` tiene stubs que lanzan
`NotImplementedError`. Reemplazar cada método por la query real:

```ts
async list(ctx) {
  const sb = await createServer();
  if (!sb) throw new Error("Supabase no inicializado");
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("business_id", ctx.businessId);
  if (error) throw error;
  return data.map(rowToProduct);
}
```

Las páginas no cambian — solo el backing store.

## 8. Storage buckets

```sql
-- En SQL editor, crear buckets:
insert into storage.buckets (id, name, public) values
  ('certificates', 'certificates', false),
  ('evidence', 'evidence', false),
  ('invoices', 'invoices', false),
  ('public', 'public', true);
```

Policies por bucket en migración aparte (`0003_storage_policies.sql`).

## 9. Backups

Pro plan habilita PITR de 7 días automático. Para `certificates` bucket
adicional, programar `pg_dump` semanal a S3 externo (opcional).

## 10. Switch a producción

1. `DATA_SOURCE=supabase` en Vercel env.
2. Deploy preview → smoke test.
3. Cross-tenant test E2E → verde.
4. Promote a production.
