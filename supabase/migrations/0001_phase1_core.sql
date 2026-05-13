-- =============================================================================
-- DermaLand · Fase 1 — núcleo multiempresa
-- =============================================================================
-- Crea las tablas core con RLS desde el día 1.
-- Convención: snake_case en SQL, mapper a camelCase en `src/server/repositories/supabase`.
--
-- IDs: UUID v7 cuando esté disponible vía pgcrypto. Por ahora `gen_random_uuid()`.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Lee `business_id` del JWT para policies. Devuelve uuid o null.
create or replace function public.auth_business_id()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', '')::uuid;
  $$;

-- Lee `is_platform_admin` del JWT.
create or replace function public.auth_is_platform_admin()
  returns boolean
  language sql
  stable
  as $$
    select coalesce(
      (current_setting('request.jwt.claims', true)::jsonb ->> 'is_platform_admin')::boolean,
      false
    );
  $$;

-- ─── Plataforma (super admin) ───────────────────────────────────────────────

create table if not exists platform_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  is_active boolean not null default true,
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table platform_users enable row level security;

create policy platform_users_select on platform_users
  for select using (auth_is_platform_admin());

-- ─── Plans / Subscriptions ──────────────────────────────────────────────────

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  monthly_price_usd numeric(10,2) not null,
  features jsonb not null default '[]',
  limits jsonb not null default '{}',
  highlight boolean not null default false,
  created_at timestamptz not null default now()
);
-- Plans son globales; legibles por todos.
alter table plans enable row level security;
create policy plans_select on plans for select using (true);
create policy plans_admin on plans for all
  using (auth_is_platform_admin())
  with check (auth_is_platform_admin());

-- ─── Tenancy ────────────────────────────────────────────────────────────────

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  commercial_name text not null,
  rnc text not null,
  country text not null default 'República Dominicana',
  phone text,
  whatsapp text,
  email text,
  instagram_url text,
  logo_url text,
  dgii_enabled boolean not null default false,
  plan_id uuid not null references plans(id),
  status text not null default 'trial' check (status in ('active','suspended','trial','past_due')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists businesses_status_idx on businesses(status);
alter table businesses enable row level security;

-- Políticas: el usuario solo ve SU business (a menos que sea súper admin).
create policy businesses_select on businesses
  for select using (
    auth_is_platform_admin() or id = auth_business_id()
  );
create policy businesses_admin_all on businesses
  for all using (auth_is_platform_admin())
  with check (auth_is_platform_admin());
create policy businesses_self_update on businesses
  for update using (id = auth_business_id())
  with check (id = auth_business_id());

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  code text not null,
  name text not null,
  address text not null,
  city text not null,
  province text not null,
  country text not null,
  phone text,
  whatsapp text,
  email text,
  is_pilot boolean not null default false,
  show_on_website boolean not null default true,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(business_id, code)
);
create index if not exists branches_business_idx on branches(business_id);
alter table branches enable row level security;
create policy branches_select on branches
  for select using (business_id = auth_business_id() or auth_is_platform_admin());
create policy branches_write on branches
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, code)
);
alter table warehouses enable row level security;
create policy warehouses_all on warehouses
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Users / Roles / Permissions ────────────────────────────────────────────

create table if not exists users (
  id uuid primary key,                          -- mismo id que auth.users
  business_id uuid not null references businesses(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  phone text,
  role text not null default 'cashier' check (role in
    ('admin','manager','cashier','inventory','supervisor','auditor')),
  branch_ids uuid[] not null default '{}',
  two_factor_enabled boolean not null default false,
  status text not null default 'active' check (status in ('active','invited','disabled')),
  last_login_at timestamptz,
  avatar_color text not null default '#1A7F8E',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists users_business_idx on users(business_id);
alter table users enable row level security;
create policy users_select on users
  for select using (business_id = auth_business_id());
create policy users_admin_write on users
  for all using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Audit log ──────────────────────────────────────────────────────────────

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text not null,
  branch_id uuid references branches(id),
  metadata jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_business_created_idx
  on audit_logs(business_id, created_at desc);
alter table audit_logs enable row level security;
create policy audit_logs_select on audit_logs
  for select using (business_id = auth_business_id());
-- Inserts: solo via server actions con service role + verificación de business_id.
-- No exponer policy de insert al anon role.

-- =============================================================================
-- Seed: business piloto DermaLand
-- =============================================================================

insert into plans (id, name, monthly_price_usd, features, limits, highlight) values
  ('00000000-0000-0000-0000-000000000001', 'Básico', 39, '[]'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000002', 'Pro', 99, '[]'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000003', 'Business / POS', 199, '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000004', 'Premium IA', 349, '[]'::jsonb, '{}'::jsonb, false),
  ('00000000-0000-0000-0000-000000000005', 'Enterprise', 0, '[]'::jsonb, '{}'::jsonb, false)
on conflict (id) do nothing;

insert into businesses (id, legal_name, commercial_name, rnc, country, phone, whatsapp, email, plan_id, status)
values (
  '00000000-0000-0000-0000-00000000d001',
  'DermaLand SRL',
  'DermaLand',
  '1-32-59077-5',
  'República Dominicana',
  '+1 809-226-5252',
  '+1 809-226-5252',
  'dermalandrd@gmail.com',
  '00000000-0000-0000-0000-000000000003',
  'trial'
) on conflict (id) do nothing;

insert into branches (id, business_id, code, name, address, city, province, country, phone, email, is_pilot)
values (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-00000000d001',
  'STG-01',
  'DermaLand Santiago',
  'Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este',
  'Santiago de los Caballeros',
  'Santiago',
  'República Dominicana',
  '+1 809-226-5252',
  'santiago@dermaland.do',
  true
) on conflict (id) do nothing;
