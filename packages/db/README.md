# @dermaland/db

Drizzle ORM + esquema SQL versionado para Supabase Postgres.

**Migraciones SQL** se generan en `supabase/migrations/` para que `supabase db push` o el flujo de Supabase CLI las aplique.

## Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm generate` | Genera SQL de migración desde el schema TS |
| `pnpm migrate` | Aplica migraciones pendientes a la DB apuntada por `SUPABASE_DB_URL` |
| `pnpm push` | (solo dev) sincroniza schema sin migración formal |
| `pnpm studio` | UI Drizzle Studio para inspeccionar la DB |
| `pnpm seed` | Inserta datos placeholder + demo |

## Convenciones

- Toda tabla operativa lleva `business_id UUID NOT NULL` y RLS por `auth.jwt() ->> 'business_id'`.
- IDs: UUID v7 (k-sortable) en columnas internas. Códigos visibles (`CLI-000001`) generados con secuencias por business.
- Soft delete: `deleted_at TIMESTAMPTZ`.
- Timestamps: `created_at` y `updated_at` con default `now()` y trigger de actualización.
