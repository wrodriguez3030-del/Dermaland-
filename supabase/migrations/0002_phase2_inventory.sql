-- =============================================================================
-- DermaLand · Fase 2 — Catálogo + Inventario por lote + Conteos físicos
-- =============================================================================

-- ─── Catalog ────────────────────────────────────────────────────────────────

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  product_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, name)
);
alter table brands enable row level security;
create policy brands_all on brands for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists laboratories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table laboratories enable row level security;
create policy laboratories_all on laboratories for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  parent_id uuid references product_categories(id),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table product_categories enable row level security;
create policy product_categories_all on product_categories for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  brand_id uuid references brands(id),
  laboratory_id uuid references laboratories(id),
  category_id uuid references product_categories(id),
  unit text not null default 'unidad',
  pharmaceutical_form text,
  presentation text,
  active_ingredient text,
  concentration text,
  sanitary_registry text,
  storage_temperature text,
  requires_prescription boolean not null default false,
  controlled boolean not null default false,
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null,
  itbis_rate numeric(5,2) not null default 18,
  min_stock int not null default 0,
  max_stock int not null default 0,
  image_url text,
  active boolean not null default true,
  sellable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(business_id, sku)
);
create unique index if not exists products_barcode_unique
  on products(business_id, barcode)
  where barcode is not null;
create index if not exists products_business_active_idx
  on products(business_id, active);
alter table products enable row level security;
create policy products_all on products for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists product_lots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  warehouse_location_id uuid,
  lot_number text not null,
  manufactured_at date,
  expires_at date not null,
  received_at timestamptz not null default now(),
  initial_quantity int not null,
  current_quantity int not null,
  unit_cost numeric(12,2) not null,
  unit_price numeric(12,2),
  supplier_id uuid,
  purchase_invoice text,
  status text not null default 'available'
    check (status in ('available','quarantine','expired','recalled','damaged','returned')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, product_id, lot_number, warehouse_id)
);
create index if not exists product_lots_fefo_idx
  on product_lots(business_id, product_id, expires_at)
  where status = 'available' and current_quantity > 0;
create index if not exists product_lots_expiring_idx
  on product_lots(business_id, expires_at)
  where status = 'available';
alter table product_lots enable row level security;
create policy product_lots_all on product_lots for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Vista materializada (refresh manual o trigger): stock por (producto, lote).
-- Para MVP usar vista normal y solo refrescar materialized en Fase 11.
create or replace view inventory_stock_by_lot as
  select
    business_id,
    branch_id,
    warehouse_id,
    product_id,
    id as lot_id,
    lot_number,
    expires_at,
    current_quantity as quantity,
    status
  from product_lots
  where deleted_at is null;

-- Movements
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_id uuid references product_lots(id),
  warehouse_id uuid not null references warehouses(id),
  type text not null check (type in (
    'entry_purchase','exit_sale','transfer_out','transfer_in',
    'adjustment_positive','adjustment_negative','return_in','return_out',
    'quarantine','release','expiry','count_adjustment'
  )),
  quantity int not null,
  reason text,
  reference text,
  user_id uuid references users(id),
  user_name text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_business_idx
  on inventory_movements(business_id, created_at desc);
alter table inventory_movements enable row level security;
create policy inventory_movements_all on inventory_movements for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Inventory counts (Phase 2.1) ───────────────────────────────────────────

create table if not exists inventory_counts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  count_number text not null,
  count_type text not null check (count_type in ('full','partial','spot')),
  status text not null default 'draft' check (status in (
    'draft','in_progress','paused','submitted','reviewed','approved','rejected','adjusted','cancelled'
  )),
  assigned_to uuid[] not null default '{}',
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  reviewed_by uuid references users(id),
  approved_by uuid references users(id),
  notes text,
  scan_count int not null default 0,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, count_number)
);
alter table inventory_counts enable row level security;
create policy inventory_counts_all on inventory_counts for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists inventory_count_scans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  product_id uuid not null references products(id),
  product_lot_id uuid references product_lots(id),
  branch_id uuid not null references branches(id),
  warehouse_id uuid not null references warehouses(id),
  warehouse_location_id uuid,
  barcode text,
  scanned_quantity int not null default 1,
  scan_source text not null check (scan_source in ('camera','bluetooth_scanner','manual')),
  scanned_by uuid references users(id),
  scanned_by_name text,
  scanned_at timestamptz not null default now(),
  device_id text not null,
  offline_scan_id text not null,
  sync_status text not null default 'synced' check (sync_status in ('synced','pending','failed')),
  notes text,
  created_at timestamptz not null default now()
);
-- Idempotencia: un mismo scan offline nunca se duplica al sincronizar.
create unique index if not exists inventory_count_scans_idempotent
  on inventory_count_scans(device_id, offline_scan_id);
create index if not exists inventory_count_scans_count_idx
  on inventory_count_scans(inventory_count_id, scanned_at desc);
alter table inventory_count_scans enable row level security;
create policy inventory_count_scans_all on inventory_count_scans for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  product_id uuid not null references products(id),
  product_sku text not null,
  product_name text not null,
  product_lot_id uuid references product_lots(id),
  lot_number text,
  expires_at date,
  warehouse_id uuid not null references warehouses(id),
  expected_quantity int not null,
  counted_quantity int not null default 0,
  difference_quantity int generated always as (counted_quantity - expected_quantity) stored,
  status text not null default 'match' check (status in
    ('match','shortage','overage','expired','unregistered')),
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inventory_count_items enable row level security;
create policy inventory_count_items_all on inventory_count_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists inventory_count_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  inventory_count_item_id uuid references inventory_count_items(id),
  file_url text not null,
  file_type text not null,
  notes text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
alter table inventory_count_evidence enable row level security;
create policy inventory_count_evidence_all on inventory_count_evidence for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists inventory_count_sync_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  inventory_count_id uuid not null references inventory_counts(id),
  device_id text not null,
  user_id uuid references users(id),
  sync_status text not null check (sync_status in ('success','partial','failed')),
  request_payload jsonb,
  response_payload jsonb,
  conflict_detected boolean not null default false,
  error_message text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table inventory_count_sync_logs enable row level security;
create policy inventory_count_sync_logs_all on inventory_count_sync_logs for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Lot quarantine / recall ────────────────────────────────────────────────

create table if not exists lot_quarantine (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_lot_id uuid not null references product_lots(id) on delete cascade,
  reason text not null,
  user_id uuid references users(id),
  released_at timestamptz,
  released_by uuid references users(id),
  created_at timestamptz not null default now()
);
alter table lot_quarantine enable row level security;
create policy lot_quarantine_all on lot_quarantine for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists lot_recalls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_lot_id uuid not null references product_lots(id) on delete cascade,
  reason text not null,
  initiated_by uuid references users(id),
  customers_notified int not null default 0,
  created_at timestamptz not null default now()
);
alter table lot_recalls enable row level security;
create policy lot_recalls_all on lot_recalls for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── FEFO function ──────────────────────────────────────────────────────────
-- Devuelve el lot_id más próximo a vencer disponible para un producto.
-- POS y server actions deben usar SOLO esta función para selección de lote.

create or replace function public.select_lot_for_sale(
  p_business_id uuid,
  p_product_id uuid,
  p_branch_id uuid default null
) returns uuid
  language sql
  stable
  as $$
    select id
    from product_lots
    where business_id = p_business_id
      and product_id = p_product_id
      and (p_branch_id is null or branch_id = p_branch_id)
      and status = 'available'
      and current_quantity > 0
      and expires_at > current_date
    order by expires_at asc
    limit 1;
  $$;
