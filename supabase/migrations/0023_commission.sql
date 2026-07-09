-- 0023_commission.sql — Comisión de ventas (Fase 2: persistencia compartida).
--
-- Reglas configurables, exclusiones manuales, estado de pago, lotes de pago y
-- auditoría de comisiones. Reemplaza los stores localStorage por tablas
-- compartidas con RLS por business_id (mismo patrón que el resto del esquema).
-- Aditivo e idempotente: no toca tablas ni datos existentes.

-- ── Reglas de comisión ───────────────────────────────────────────────────────
create table if not exists sales_commission_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  percentage numeric(6,3) not null,
  -- grupos de método canónicos ('cash','card','transfer','other'); null = cualquiera
  payment_groups text[],
  seller_id uuid references users(id),
  branch_id uuid references branches(id),
  starts_at date,
  ends_at date,
  priority int not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commission_rules_business_idx
  on sales_commission_rules (business_id, active);

-- ── Exclusiones manuales (por número de comprobante) ─────────────────────────
create table if not exists commission_exclusions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  comprobante text not null,
  reason text not null,
  user_name text,
  created_at timestamptz not null default now(),
  unique (business_id, comprobante)
);
create index if not exists commission_exclusions_business_idx
  on commission_exclusions (business_id);

-- ── Lotes de pago ────────────────────────────────────────────────────────────
create table if not exists commission_payment_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  period_from date,
  period_to date,
  seller_id uuid references users(id),
  seller_name text,
  comprobantes text[] not null default '{}',
  total numeric(12,2) not null default 0,
  status text not null default 'paid'
    check (status in ('paid','voided')),
  created_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists commission_batches_business_idx
  on commission_payment_batches (business_id, created_at desc);

-- ── Estado de pago por comprobante ───────────────────────────────────────────
create table if not exists commission_payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  comprobante text not null,
  status text not null check (status in ('approved','paid')),
  user_name text,
  batch_id uuid references commission_payment_batches(id) on delete set null,
  at timestamptz not null default now(),
  unique (business_id, comprobante)
);
create index if not exists commission_payouts_business_idx
  on commission_payouts (business_id);

-- ── Auditoría ────────────────────────────────────────────────────────────────
create table if not exists commission_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  action text not null
    check (action in ('approved','paid','excluded','included','batch_created','voided','adjusted')),
  comprobantes text[] not null default '{}',
  amount numeric(12,2),
  batch_id uuid references commission_payment_batches(id) on delete set null,
  user_name text,
  reason text,
  at timestamptz not null default now()
);
create index if not exists commission_audit_business_idx
  on commission_audit (business_id, at desc);

-- ── RLS por business_id (mismo patrón que el resto del esquema) ───────────────
alter table sales_commission_rules       enable row level security;
alter table commission_exclusions        enable row level security;
alter table commission_payment_batches   enable row level security;
alter table commission_payouts           enable row level security;
alter table commission_audit             enable row level security;

drop policy if exists sales_commission_rules_all on sales_commission_rules;
create policy sales_commission_rules_all on sales_commission_rules for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

drop policy if exists commission_exclusions_all on commission_exclusions;
create policy commission_exclusions_all on commission_exclusions for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

drop policy if exists commission_payment_batches_all on commission_payment_batches;
create policy commission_payment_batches_all on commission_payment_batches for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

drop policy if exists commission_payouts_all on commission_payouts;
create policy commission_payouts_all on commission_payouts for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

drop policy if exists commission_audit_all on commission_audit;
create policy commission_audit_all on commission_audit for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

notify pgrst, 'reload schema';
