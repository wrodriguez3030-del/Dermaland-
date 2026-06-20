-- =============================================================================
-- DermaLand · Transferencias de inventario entre almacenes
-- =============================================================================
-- No destructiva: sólo CREATE TABLE IF NOT EXISTS + RLS por business_id.
-- El stock real sigue viviendo en product_lots; una transferencia descuenta
-- del lote origen y crea/aumenta el lote destino, registrando dos movimientos
-- (transfer_out / transfer_in) en inventory_movements con la misma referencia.

create table if not exists inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  transfer_number text not null,
  origin_warehouse_id uuid not null references warehouses(id),
  destination_warehouse_id uuid not null references warehouses(id),
  transfer_date date not null default current_date,
  notes text,
  status text not null default 'completed'
    check (status in ('draft', 'completed', 'voided')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, transfer_number),
  check (origin_warehouse_id <> destination_warehouse_id)
);
create index if not exists inventory_transfers_business_idx
  on inventory_transfers(business_id, transfer_date desc);
alter table inventory_transfers enable row level security;
create policy inventory_transfers_all on inventory_transfers for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  transfer_id uuid not null references inventory_transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_id uuid references product_lots(id),
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null default 0,
  expiration_date date,
  created_at timestamptz not null default now()
);
create index if not exists inventory_transfer_items_transfer_idx
  on inventory_transfer_items(transfer_id);
create index if not exists inventory_transfer_items_business_idx
  on inventory_transfer_items(business_id, product_id);
alter table inventory_transfer_items enable row level security;
create policy inventory_transfer_items_all on inventory_transfer_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Notificar a PostgREST que recargue el esquema.
notify pgrst, 'reload schema';
