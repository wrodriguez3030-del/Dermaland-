-- 0015_cash_movements.sql
-- Movimientos manuales de efectivo del turno de caja: ingresos, retiros y
-- devoluciones de dinero. ADITIVO / no destructivo (create table if not exists).
-- Multi-tenant por business_id con RLS, ligado a la sesión de caja.
--
-- NO toca DGII real, secuencias ni datos existentes.

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  cash_register_session_id uuid not null
    references cash_register_sessions(id) on delete cascade,

  -- income = ingreso de efectivo; withdrawal = retiro; refund = devolución.
  type text not null check (type in ('income','withdrawal','refund')),
  -- Método del movimiento; solo 'cash' afecta el efectivo físico de la caja.
  method text not null default 'cash',
  amount numeric(14,2) not null check (amount >= 0),
  reason text,

  created_by uuid references users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_session_idx
  on cash_movements(business_id, cash_register_session_id, created_at desc);

alter table cash_movements enable row level security;

drop policy if exists cash_movements_all on cash_movements;
create policy cash_movements_all on cash_movements for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Recargar el cache de esquema de PostgREST.
notify pgrst, 'reload schema';
