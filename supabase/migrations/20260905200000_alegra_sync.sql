-- Sincronizador Alegra → DermaLand (spec docs/superpowers/specs/2026-09-05-alegra-sync-design.md).
-- Alegra manda; DermaLand solo lee. Nada de esto borra datos.

alter table public.products  add column if not exists alegra_id text;
alter table public.clients   add column if not exists alegra_id text;
alter table public.suppliers add column if not exists alegra_id text;

create unique index if not exists products_alegra_id_unique
  on public.products (business_id, alegra_id) where alegra_id is not null;
create unique index if not exists clients_alegra_id_unique
  on public.clients (business_id, alegra_id) where alegra_id is not null;
create unique index if not exists suppliers_alegra_id_unique
  on public.suppliers (business_id, alegra_id) where alegra_id is not null;

-- `clients.source` tiene CHECK cerrado; se amplía con 'alegra'.
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check
  check (source in ('manual','whatsapp','web','import','agendapro','alegra'));

create table if not exists public.alegra_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  alegra_id text not null,
  branch_id uuid references public.branches(id),
  client_id uuid references public.clients(id),
  alegra_client_id text,
  client_name text,
  client_document text,
  client_document_type text,
  ncf text,
  ncf_prefix text,
  date date not null,
  issued_at timestamptz,
  status text not null check (status in ('open','closed','void','draft')),
  payment_method text,
  seller_name text,
  station text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  payments jsonb not null default '[]'::jsonb,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, alegra_id)
);
create index if not exists alegra_invoices_business_date on public.alegra_invoices (business_id, date desc);
create index if not exists alegra_invoices_business_client on public.alegra_invoices (business_id, client_id);
create index if not exists alegra_invoices_open_balance on public.alegra_invoices (business_id, status) where balance > 0;

create table if not exists public.alegra_invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  invoice_id uuid not null references public.alegra_invoices(id) on delete cascade,
  line_no int not null,
  alegra_item_id text,
  product_id uuid references public.products(id),
  name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  discount numeric(14,2) not null default 0,
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  unique (invoice_id, line_no)
);
create index if not exists alegra_invoice_items_product on public.alegra_invoice_items (product_id);

create table if not exists public.alegra_sync_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  trigger text not null check (trigger in ('cron','manual','cli')),
  mode text not null check (mode in ('full','incremental')),
  dry_run boolean not null default true,
  counts jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  reference text,
  log_url text
);
create index if not exists alegra_sync_runs_business_started on public.alegra_sync_runs (business_id, started_at desc);

alter table public.alegra_invoices enable row level security;
alter table public.alegra_invoice_items enable row level security;
alter table public.alegra_sync_runs enable row level security;

-- Solo lectura desde la app (mismo patrón que web_orders). Escribe el service_role.
drop policy if exists alegra_invoices_sel on public.alegra_invoices;
create policy alegra_invoices_sel on public.alegra_invoices for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
drop policy if exists alegra_invoice_items_sel on public.alegra_invoice_items;
create policy alegra_invoice_items_sel on public.alegra_invoice_items for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
drop policy if exists alegra_sync_runs_sel on public.alegra_sync_runs;
create policy alegra_sync_runs_sel on public.alegra_sync_runs for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);
