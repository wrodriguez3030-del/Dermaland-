-- =============================================================================
-- DermaLand · Compras y gastos (proveedores, gastos, gastos menores, recurrentes)
-- =============================================================================
-- No destructiva: sólo CREATE TABLE IF NOT EXISTS + RLS por business_id.

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  rnc text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (business_id, name)
);
alter table suppliers enable row level security;
create policy suppliers_all on suppliers for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);
alter table expense_categories enable row level security;
create policy expense_categories_all on expense_categories for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  supplier_id uuid references suppliers(id),
  supplier_name text not null,
  supplier_rnc text,
  number text not null,
  ncf text,
  issue_date date not null,
  due_date date,
  payment_condition text,
  subtotal numeric not null default 0,
  itbis numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  status text not null default 'pendiente'
    check (status in ('borrador','pendiente','parcial','pagada','vencida','anulada')),
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists supplier_invoices_business_idx
  on supplier_invoices (business_id, issue_date desc);
alter table supplier_invoices enable row level security;
create policy supplier_invoices_all on supplier_invoices for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null default 0,
  itbis numeric not null default 0,
  total numeric not null default 0,
  lot_number text,
  expiration_date date,
  branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);
create index if not exists supplier_invoice_items_invoice_idx
  on supplier_invoice_items (invoice_id);
alter table supplier_invoice_items enable row level security;
create policy supplier_invoice_items_all on supplier_invoice_items for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  expense_date date not null,
  category text not null,
  payee text,
  concept text not null,
  amount numeric not null check (amount > 0),
  method text not null
    check (method in ('efectivo','tarjeta','transferencia','cheque','otro')),
  -- Sólo últimos 4 dígitos; NUNCA el PAN completo.
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  reference text,
  petty boolean not null default false,
  responsible text,
  status text not null default 'pagado'
    check (status in ('registrado','pendiente','pagado','anulado')),
  note text,
  cash_session_id uuid references cash_register_sessions(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists expenses_business_idx
  on expenses (business_id, expense_date desc);
alter table expenses enable row level security;
create policy expenses_all on expenses for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  name text not null,
  supplier text,
  category text not null,
  amount numeric not null check (amount > 0),
  frequency text not null
    check (frequency in ('semanal','quincenal','mensual','trimestral','anual')),
  pay_day int,
  start_date date not null,
  end_date date,
  method text not null
    check (method in ('efectivo','tarjeta','transferencia','cheque','otro')),
  status text not null default 'active' check (status in ('active','inactive')),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table recurring_expenses enable row level security;
create policy recurring_expenses_all on recurring_expenses for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

create table if not exists recurring_expense_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  recurring_id uuid not null references recurring_expenses(id) on delete cascade,
  run_date date not null,
  amount numeric not null,
  expense_id uuid references expenses(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recurring_expense_runs_idx
  on recurring_expense_runs (recurring_id, run_date desc);
alter table recurring_expense_runs enable row level security;
create policy recurring_expense_runs_all on recurring_expense_runs for all
  using (business_id = auth_business_id()) with check (business_id = auth_business_id());

notify pgrst, 'reload schema';
