-- 0038_web_orders.sql
-- El pedido de la tienda en línea.
--
-- Por qué NO es una proforma: `proformas.cashier_id` y `cashier_name` son NOT
-- NULL, y a las once de la noche no hay cajero; `number` gastaría además un
-- número de documento en un pedido que puede cancelarse. La venta se cobra en el
-- POS cuando el cliente llega a retirar, que es donde viven la caja y las reglas
-- documentales.
--
-- El pedido NO mueve inventario. Reservar exigiría tocar lotes y FEFO, que es
-- justo lo que esta fase no puede permitirse.
--
-- Idempotente de principio a fin: el historial de migraciones no es fiable y se
-- verifica por objeto (R-WEB-04).

create sequence if not exists public.web_order_number_seq;

create table if not exists public.web_orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  -- Sucursal de RETIRO. No hay envío a domicilio.
  branch_id     uuid not null references public.branches (id),
  number        text not null unique,
  client_id     uuid references public.clients (id) on delete set null,
  auth_user_id  uuid references auth.users (id) on delete set null,

  -- Contacto en INSTANTÁNEA: el pedido debe recordar a quién se le vendió
  -- aunque el cliente cambie de teléfono la semana que viene.
  contact_name  text not null,
  contact_phone text not null,
  contact_email text,

  fulfillment   text not null default 'pickup'
                check (fulfillment in ('pickup', 'delivery')),

  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  itbis    numeric(12,2) not null default 0,
  total    numeric(12,2) not null default 0,

  status text not null default 'recibido'
    check (status in ('recibido','confirmado','preparando','listo','entregado','cancelado')),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente','pagado','reembolsado')),

  -- Para el día que el pago en línea obligue a emitir el documento antes (F3.5).
  proforma_id uuid references public.proformas (id) on delete set null,
  cancel_reason text,
  notes text,
  -- Un doble clic en "Enviar pedido" no puede crear dos pedidos.
  idempotency_key text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.web_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.web_orders (id) on delete cascade,
  -- Repetido a propósito: permite una política RLS sin salto a la tabla padre.
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id  uuid not null references public.products (id),

  -- INSTANTÁNEA: los precios cambian y el pedido tiene que recordar lo que se
  -- ofreció. Mismo criterio que `sales_incentives`.
  product_name text not null,
  unit_price   numeric(12,2) not null,
  qty          integer not null check (qty > 0),
  line_total   numeric(12,2) not null,

  created_at timestamptz not null default now()
);

create index if not exists web_orders_business_idx
  on public.web_orders (business_id, created_at desc);
create index if not exists web_orders_status_idx
  on public.web_orders (business_id, status);
create index if not exists web_orders_auth_user_idx
  on public.web_orders (auth_user_id);
create index if not exists web_order_items_order_idx
  on public.web_order_items (order_id);

alter table public.web_orders enable row level security;
alter table public.web_order_items enable row level security;

-- Deny-by-default. El personal lee lo de SU negocio; el cliente, lo suyo.
-- Nadie escribe desde el navegador: el alta y los cambios de estado van por
-- rutas de servidor con rol comprobado, con service-role (que salta RLS).
drop policy if exists web_orders_personal on public.web_orders;
create policy web_orders_personal on public.web_orders for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

drop policy if exists web_orders_propio on public.web_orders;
create policy web_orders_propio on public.web_orders for select
  using (auth_user_id = auth.uid());

drop policy if exists web_order_items_personal on public.web_order_items;
create policy web_order_items_personal on public.web_order_items for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

drop policy if exists web_order_items_propio on public.web_order_items;
create policy web_order_items_propio on public.web_order_items for select
  using (exists (
    select 1 from public.web_orders o
    where o.id = web_order_items.order_id and o.auth_user_id = auth.uid()
  ));

revoke insert, update, delete on public.web_orders from anon, authenticated;
revoke insert, update, delete on public.web_order_items from anon, authenticated;

-- Envuelve la secuencia en una función para poder llamarla por RPC desde
-- PostgREST. `security definer` con `search_path` fijado: DL-14.
create or replace function public.nextval_web_order_number()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$ select nextval('public.web_order_number_seq') $$;

revoke execute on function public.nextval_web_order_number() from anon, authenticated;

notify pgrst, 'reload schema';
