-- 0041_transfer_payments.sql
-- Pago por transferencia con comprobante.
--
-- El bucket `payment-receipts` es PRIVADO: un comprobante lleva el nombre del
-- titular, su banco y a veces su número de cuenta. Servirlo en una URL pública
-- adivinable sería publicar eso. El personal lo ve por URL firmada de 10 min.
--
-- `web_order_receipts` guarda el historial en vez de una sola columna en el
-- pedido: la gente sube el archivo equivocado y vuelve a subir, y cuando hay una
-- discusión de dinero conviene saber qué llegó y cuándo.

create table if not exists public.payment_bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  bank_name     text not null,
  account_type  text not null default 'ahorros' check (account_type in ('ahorros','corriente')),
  account_number text not null,
  holder_name   text not null,
  holder_document text,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- `efectivo` por defecto: es lo que hacían todos los pedidos anteriores.
alter table public.web_orders
  add column if not exists payment_method text not null default 'efectivo'
    check (payment_method in ('efectivo','transferencia','tarjeta'));

create table if not exists public.web_order_receipts (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.web_orders (id) on delete cascade,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  storage_path  text not null unique,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  status        text not null default 'pendiente'
                check (status in ('pendiente','aceptado','rechazado')),
  review_note   text,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  uploaded_at   timestamptz not null default now()
);

create index if not exists web_order_receipts_order_idx
  on public.web_order_receipts (order_id, uploaded_at desc);
create index if not exists web_order_receipts_business_idx
  on public.web_order_receipts (business_id, status);
create index if not exists payment_bank_accounts_business_idx
  on public.payment_bank_accounts (business_id, active, sort_order);

alter table public.payment_bank_accounts enable row level security;
alter table public.web_order_receipts enable row level security;

drop policy if exists payment_bank_accounts_personal on public.payment_bank_accounts;
create policy payment_bank_accounts_personal on public.payment_bank_accounts for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

drop policy if exists web_order_receipts_personal on public.web_order_receipts;
create policy web_order_receipts_personal on public.web_order_receipts for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

revoke insert, update, delete on public.payment_bank_accounts from anon, authenticated;
revoke insert, update, delete on public.web_order_receipts from anon, authenticated;

-- Privado, 5 MB, y sin SVG: puede llevar `<script>` dentro y se serviría desde
-- nuestro propio dominio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
