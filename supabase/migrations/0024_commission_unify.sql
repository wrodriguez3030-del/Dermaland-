-- 0024_commission_unify.sql — Unificación Incentivos ↔ Comisión ventas.
--
-- ADITIVA, NO destructiva, idempotente. Prepara `sales_incentives` como fuente
-- ÚNICA de líneas de comisión reutilizando la maquinaria de Comisión (lotes,
-- auditoría). Ver docs/reports/UNIFICACION_INCENTIVOS_COMISION.md.
--
-- ⚠️ Aplicar por el SQL Editor de Supabase (el DB URL local es placeholder).
-- NO toca DGII real. NO borra ni recalcula histórico. Conserva las tablas
-- `sales_commission_rules`/`commission_payouts` como legacy hasta el cutover.

-- ── 1. Estados canónicos únicos (§10): pending·approved·paid·adjusted·voided ──
-- Amplía el check de sales_incentives.status (hoy pending/approved/paid/void).
alter table sales_incentives drop constraint if exists sales_incentives_status_check;
alter table sales_incentives
  add constraint sales_incentives_status_check
  check (status in ('pending','approved','paid','adjusted','voided','void'));
-- (Se conserva 'void' legacy; la capa central lo trata igual que 'voided'.)

-- ── 2. Campos de snapshot para el reporte y ajustes (§8/§12) ─────────────────
alter table sales_incentives add column if not exists approved_at timestamptz;
alter table sales_incentives add column if not exists adjustment_amount numeric(14,2) not null default 0;
-- Grupo de método de pago materializado al generar (para "por método", §5).
alter table sales_incentives add column if not exists payment_method_group text;

-- ── 3. Reglas de incentivo = superconjunto de las de comisión (§7) ───────────
alter table sales_incentive_rules add column if not exists payment_groups text[];
alter table sales_incentive_rules add column if not exists seller_id uuid references users(id);
alter table sales_incentive_rules add column if not exists branch_id uuid references branches(id);
alter table sales_incentive_rules add column if not exists priority int not null default 10;

-- ── 4. Ítems de lote de pago (enlaza lote ↔ línea de incentivo, §11) ─────────
create table if not exists commission_payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  batch_id uuid not null references commission_payment_batches(id) on delete cascade,
  incentive_id uuid not null references sales_incentives(id) on delete cascade,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (batch_id, incentive_id)
);
create index if not exists commission_batch_items_business_idx
  on commission_payment_batch_items (business_id, batch_id);
create index if not exists commission_batch_items_incentive_idx
  on commission_payment_batch_items (incentive_id);

alter table commission_payment_batch_items enable row level security;
drop policy if exists commission_batch_items_all on commission_payment_batch_items;
create policy commission_batch_items_all on commission_payment_batch_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

notify pgrst, 'reload schema';
