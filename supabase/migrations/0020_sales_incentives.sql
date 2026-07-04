-- =============================================================================
-- DermaLand · Incentivos / comisiones de ventas por vendedor
-- =============================================================================
-- Aditiva, NO destructiva. Dos tablas:
--   sales_incentive_rules → reglas CONFIGURABLES (fijo, %, margen, lab,
--     categoría, meta).
--   sales_incentives → SNAPSHOT del incentivo generado al pagar una venta.
--     Nunca se recalcula con reglas futuras: se guarda el monto ya calculado.
-- RLS multi-tenant por business_id. NO toca DGII real.

-- ─── Reglas ────────────────────────────────────────────────────────────────
create table if not exists sales_incentive_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  rule_type text not null
    check (rule_type in (
      'fixed_per_product',   -- monto fijo por unidad de un producto
      'percent_on_sale',     -- % sobre la venta neta
      'percent_on_margin',   -- % sobre el margen (neto - costo)
      'per_laboratory',      -- fijo/% sobre líneas de un laboratorio
      'per_category',        -- fijo/% sobre líneas de una categoría
      'per_goal'             -- al alcanzar una meta de ventas (periódico)
    )),
  product_id uuid references products(id),
  laboratory_id uuid references laboratories(id),
  category_id uuid references product_categories(id),
  percentage numeric(6,3),        -- 0..100 (para reglas por %)
  fixed_amount numeric(14,2),     -- monto fijo (por unidad / por meta)
  min_sales_amount numeric(14,2), -- umbral mínimo (percent_on_sale / per_goal)
  starts_at date,
  ends_at date,
  active boolean not null default true,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incentive_rules_dates_ok
    check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists incentive_rules_business_idx
  on sales_incentive_rules (business_id, active);

alter table sales_incentive_rules enable row level security;
drop policy if exists incentive_rules_all on sales_incentive_rules;
create policy incentive_rules_all on sales_incentive_rules for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Incentivos generados (snapshot) ────────────────────────────────────────
create table if not exists sales_incentives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sale_id uuid not null references proformas(id) on delete cascade,
  seller_id uuid references users(id),
  seller_name text,                -- snapshot
  rule_id uuid references sales_incentive_rules(id),
  rule_name text,                  -- snapshot (la regla puede cambiar/borrarse)
  rule_type text,
  product_id uuid references products(id),
  base_amount numeric(14,2) not null default 0,
  incentive_amount numeric(14,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','approved','paid','void')),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  payment_batch_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un incentivo por (venta, regla, producto) — idempotencia de generación.
  unique (sale_id, rule_id, product_id)
);

create index if not exists sales_incentives_business_idx
  on sales_incentives (business_id, seller_id, status);
create index if not exists sales_incentives_sale_idx
  on sales_incentives (sale_id);
create index if not exists sales_incentives_batch_idx
  on sales_incentives (payment_batch_id);

alter table sales_incentives enable row level security;
drop policy if exists sales_incentives_all on sales_incentives;
create policy sales_incentives_all on sales_incentives for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

notify pgrst, 'reload schema';
