-- =============================================================================
-- DermaLand · Fase 2a — Tabla clients (CRM)
-- =============================================================================
-- Esta migracion crea la tabla `clients` referenciada por:
--   - proformas.customer_id (0003_dgii_pos.sql)
--   - electronic_invoices.customer_id (0003_dgii_pos.sql)
--
-- Modelo TS de referencia: src/types/index.ts -> interface Customer.
-- Convenciones: snake_case en SQL, mapper a camelCase en
-- src/server/repositories/supabase/mappers.ts (pendiente).
-- RLS por tenant con auth_business_id() definida en 0001_phase1_core.sql.
--
-- Reglas de negocio:
--   - Sin duplicados por documentNumber (indice parcial unico por business).
--   - defaultBillingType: 'consumo' (default) | 'credito_fiscal'.
--   - skinType estructurado.
--   - Soft delete via deleted_at.
--
-- RENOMBRADO 2026-08-05: antes se llamaba `0002a_clients.sql`. El contenido no
-- cambio ni una linea; solo cambia el prefijo.
--
-- POR QUE. La CLI de Supabase lista las migraciones locales con
-- /^([0-9]+)_(.*)\.sql$/ y SALTA en silencio (solo aviso por stderr) las que no
-- casan. La `a` de `0002a` rompia la expresion, asi que `supabase db push` se
-- saltaba este archivo y la reconstruccion desde cero reventaba en
-- 0003_dgii_pos.sql —que referencia `clients`— con un error que no señalaba la
-- causa real.
--
-- POR QUE `00030` Y NO LA VERSION DEL HISTORIAL (20260519205927). Porque la
-- posicion importa mas que el numero. Esta migracion tiene que aplicarse
-- DESPUES de 0002 y ANTES de 0003: la `a` estaba haciendo ese trabajo. Un
-- prefijo de 14 digitos ordena despues de TODOS los de 4 (`'0' < '2'`), o sea
-- que mandaria `clients` al final y romperia las 8 migraciones que dependen de
-- ella (comprobado: 1 fallo pasa a 23). Y no existe ningun prefijo `0002X_`
-- que sirva, porque cualquier digito ordena ANTES del `_` en ASCII
-- (`'9' 0x39 < '_' 0x5F`), asi que `00021_` cae antes de `0002_`. `00030_` es
-- lo unico que ordena entre `0002_` y `0003_`.
--
-- LO QUE SI SE CONSERVA EXACTO ES EL NOMBRE. La CLI deriva de este archivo
-- `name = 0002a_clients`, que es literalmente el nombre con que figura en
-- supabase_migrations.schema_migrations (version 20260519205927). El `00030` es
-- de la misma naturaleza que el `0001`..`0046` del resto del repositorio:
-- ninguno de esos 46 numeros es tampoco la version registrada.
-- =============================================================================

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  customer_number text not null,
  first_name text not null,
  last_name text not null,
  document_type text
    check (document_type in ('cedula','rnc','passport')),
  document_number text,

  phone text,
  whatsapp text,
  email text,
  birth_date date,
  address text,
  city text,
  province text,

  source text not null default 'manual'
    check (source in ('manual','whatsapp','web','import','agendapro')),
  tags text[] not null default '{}',

  default_billing_type text not null default 'consumo'
    check (default_billing_type in ('consumo','credito_fiscal')),
  skin_type text not null default 'not_specified'
    check (skin_type in (
      'not_specified','normal','dry','oily','combination','sensitive',
      'acne_prone','mature','hyperpigmentation','rosacea_reactive'
    )),

  total_spent numeric(14,2) not null default 0,
  total_orders int not null default 0,
  last_visit_at timestamptz,

  notes text,
  consents jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  unique (business_id, customer_number)
);

-- Sin duplicados por documento dentro del mismo business (cedula/rnc/passport).
create unique index if not exists clients_business_document_unique
  on clients(business_id, document_number)
  where document_number is not null and deleted_at is null;

create index if not exists clients_business_idx
  on clients(business_id);
create index if not exists clients_business_active_idx
  on clients(business_id, deleted_at);

alter table clients enable row level security;
create policy clients_select on clients
  for select using (business_id = auth_business_id());
create policy clients_write on clients for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());
