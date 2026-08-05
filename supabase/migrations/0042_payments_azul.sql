-- 0042_payments_azul
--
-- RECONSTRUIDO 2026-08-05 desde la definicion viva de la base.
-- Esta migracion se aplico en su dia con `apply_migration` del MCP y nunca
-- dejo un .sql en el repositorio, de modo que supabase/migrations/ no podia
-- reconstruir el esquema desde cero. El registro en
-- supabase_migrations.schema_migrations YA EXISTE (version 20260804195156):
-- este archivo NO debe reaplicarse en produccion, solo permitir levantar el
-- esquema de cero. Idempotente a proposito.
--
-- FUENTE: el SQL literal guardado en
-- supabase_migrations.schema_migrations.statements para la version
-- 20260804195156, contrastado columna por columna contra
-- information_schema.columns, pg_constraint (8 constraints), pg_indexes (8
-- indices), pg_policies (payments_personal) e
-- information_schema.role_table_grants — donde se confirma que `anon` y
-- `authenticated` conservan SELECT pero NO tienen INSERT/UPDATE/DELETE, o sea
-- que el `revoke` del final se aplico. Va literal: el SQL registrado ya era
-- idempotente.
--
-- NOTA de nombre: el numero 0042 ya lo usaba
-- `0042_client_identity_normalized.sql`. No se renumera a proposito — la base
-- conoce esta migracion como `0042_payments_azul` y reescribir un numero ya
-- registrado es justo lo que creo este desorden.
--
-- El adaptador de Azul NO esta escrito a proposito: esta tabla es el cimiento
-- del cobro con tarjeta (F3.5), que queda preparado y APAGADO.

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  branch_id     uuid references public.branches (id),
  order_id      uuid references public.web_orders (id) on delete set null,

  provider      text not null default 'AZUL' check (provider in ('AZUL')),
  order_number  text not null,

  amount_minor  bigint not null check (amount_minor >= 0),
  itbis_minor   bigint not null default 0 check (itbis_minor >= 0),
  currency      text not null default 'DOP',

  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','DECLINED','CANCELLED','ERROR','VOIDED','REFUNDED')),

  authorization_code text,
  response_code      text,
  iso_code           text,
  response_message   text,
  error_description  text,
  rrn                text,
  azul_order_id      text,
  payment_date       timestamptz,

  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_provider_order_number_uniq
  on public.payments (provider, order_number);

create unique index if not exists payments_provider_rrn_uniq
  on public.payments (provider, rrn) where rrn is not null;

create unique index if not exists payments_provider_azul_order_uniq
  on public.payments (provider, azul_order_id) where azul_order_id is not null;

create unique index if not exists payments_idempotency_uniq
  on public.payments (idempotency_key) where idempotency_key is not null;

create index if not exists payments_business_status_idx
  on public.payments (business_id, status, created_at desc);
create index if not exists payments_order_idx
  on public.payments (order_id);
create index if not exists payments_auth_code_idx
  on public.payments (business_id, authorization_code) where authorization_code is not null;

alter table public.payments enable row level security;

drop policy if exists payments_personal on public.payments;
create policy payments_personal on public.payments for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

revoke insert, update, delete on public.payments from anon, authenticated;

notify pgrst, 'reload schema';
