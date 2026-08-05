-- 20260711182946_ai_providers_module.sql
--
-- RECONSTRUIDO 2026-08-05 desde la definicion viva de la base.
-- Esta migracion se aplico en su dia con `apply_migration` del MCP y nunca
-- dejo un .sql en el repositorio, de modo que supabase/migrations/ no podia
-- reconstruir el esquema desde cero. El registro en
-- supabase_migrations.schema_migrations YA EXISTE (version 20260711182946):
-- este archivo NO debe reaplicarse en produccion, solo permitir levantar el
-- esquema de cero. Idempotente a proposito.
--
-- EL NOMBRE ES LA IDENTIDAD REGISTRADA, no una numeracion inventada. La CLI de
-- Supabase lista las migraciones locales con /^([0-9]+)_(.*)\.sql$/ y SALTA en
-- silencio (solo aviso por stderr) las que no casan. Con el nombre a secas,
-- `supabase db push` — el procedimiento de docs/supabase-setup.md — ignoraba
-- este archivo y reconstruia una base incompleta. Con el prefijo
-- `20260711182946_` la CLI deriva exactamente la version y el nombre que ya
-- guarda supabase_migrations.schema_migrations, asi que el viaje de ida y
-- vuelta es exacto.
--
-- FUENTE: el SQL literal guardado en
-- supabase_migrations.schema_migrations.statements para esa version,
-- contrastado columna por columna, indice por indice y policy por policy
-- contra el catalogo vivo (information_schema.columns, pg_indexes,
-- pg_constraint, pg_policies, pg_class.relrowsecurity).
--
-- UNICO CAMBIO respecto al SQL registrado: se antepone
-- `drop policy if exists` a cada `create policy`, porque `create policy` a
-- secas no es idempotente. El resto va literal, acentos incluidos.

-- Módulo seguro de Proveedores de IA. Multi-tenant por business_id + RLS.
-- Las claves NUNCA se guardan en texto plano (van cifradas AES-256-GCM en
-- ai_provider_secrets). No toca DGII ni datos fiscales.

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  provider_type text not null check (provider_type in ('openai','openai_compatible','anthropic','google','local')),
  display_name text not null,
  status text not null default 'unconfigured' check (status in ('unconfigured','connected','error','paused','limit_reached')),
  base_url text,
  organization_id text,
  project_id text,
  default_model text,
  economical_model text,
  reasoning_model text,
  fallback_model text,
  monthly_request_limit integer,
  monthly_budget_usd numeric,
  max_output_tokens integer,
  max_tool_calls integer,
  timeout_ms integer,
  streaming_enabled boolean not null default true,
  store_responses boolean not null default false,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_latency_ms integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists ai_providers_business_idx on public.ai_providers (business_id) where deleted_at is null;

create table if not exists public.ai_provider_secrets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  encrypted_api_key text not null,
  iv text not null,
  auth_tag text not null,
  encryption_version integer not null default 1,
  key_last_four text,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (provider_id)
);

create table if not exists public.ai_agent_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  agent_id text not null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  model text,
  fallback_provider_id uuid references public.ai_providers(id) on delete set null,
  fallback_model text,
  status text not null default 'active' check (status in ('active','paused')),
  temperature numeric,
  reasoning_effort text,
  max_output_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, agent_id)
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  agent_id text,
  provider_id uuid,
  provider_type text,
  model text,
  user_id uuid,
  branch_id uuid,
  conversation_id text,
  channel text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric not null default 0,
  latency_ms integer,
  tools_used text[],
  status text not null default 'success' check (status in ('success','error','timeout','rate_limited','fallback')),
  error_summary text,
  was_fallback boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_logs_business_created_idx on public.ai_usage_logs (business_id, created_at desc);
create index if not exists ai_usage_logs_agent_idx on public.ai_usage_logs (business_id, agent_id, created_at desc);

-- RLS: aislamiento por empresa (mismo patrón que el resto: auth_business_id()).
alter table public.ai_providers enable row level security;
alter table public.ai_provider_secrets enable row level security;
alter table public.ai_agent_provider_bindings enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists ai_providers_tenant on public.ai_providers;
create policy ai_providers_tenant on public.ai_providers
  using (business_id = (select auth_business_id())) with check (business_id = (select auth_business_id()));
drop policy if exists ai_provider_secrets_tenant on public.ai_provider_secrets;
create policy ai_provider_secrets_tenant on public.ai_provider_secrets
  using (business_id = (select auth_business_id())) with check (business_id = (select auth_business_id()));
drop policy if exists ai_agent_provider_bindings_tenant on public.ai_agent_provider_bindings;
create policy ai_agent_provider_bindings_tenant on public.ai_agent_provider_bindings
  using (business_id = (select auth_business_id())) with check (business_id = (select auth_business_id()));
drop policy if exists ai_usage_logs_tenant on public.ai_usage_logs;
create policy ai_usage_logs_tenant on public.ai_usage_logs
  using (business_id = (select auth_business_id())) with check (business_id = (select auth_business_id()));

notify pgrst, 'reload schema';
