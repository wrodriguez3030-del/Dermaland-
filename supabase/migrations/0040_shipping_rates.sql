-- 0040_shipping_rates.sql
-- Envío a domicilio: a qué provincias se llega y por cuánto.
--
-- La lista de las 32 demarcaciones vive en código
-- (`features/storefront/shipping/provinces.ts`), no aquí: no cambia desde 1982,
-- y tenerla fija hace que el slug guardado en el pedido siga significando lo
-- mismo aunque alguien renombre algo en el panel.
--
-- Esta tabla guarda SOLO lo que decide el negocio: el precio y si se llega.
-- Nace **vacía a propósito**: sin fila, no se envía. Sembrarla con las 32
-- provincias a coste 0 haría que el día que se encienda el envío se pudiera
-- pedir a Pedernales gratis por un olvido.

create table if not exists public.shipping_rates (
  business_id   uuid not null references public.businesses (id) on delete cascade,
  province_slug text not null,
  cost          numeric(12,2) not null default 0 check (cost >= 0),
  -- Por defecto NO se llega. Activar cada provincia es una decisión explícita.
  active        boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  primary key (business_id, province_slug)
);

alter table public.shipping_rates enable row level security;

-- Solo lectura, y solo del propio negocio. El panel escribe con service-role
-- tras comprobar el rol: la RLS valida `business_id`, no el rol (DL-01).
drop policy if exists shipping_rates_personal on public.shipping_rates;
create policy shipping_rates_personal on public.shipping_rates for select
  using (business_id = ((auth.jwt() -> 'app_metadata') ->> 'business_id')::uuid);

revoke insert, update, delete on public.shipping_rates from anon, authenticated;

-- A dónde va el pedido. Nulas cuando es retiro en sucursal, que sigue siendo la
-- opción por defecto y la única hasta que se configure alguna provincia.
alter table public.web_orders
  add column if not exists delivery_province  text,
  add column if not exists delivery_sector    text,
  add column if not exists delivery_address   text,
  add column if not exists delivery_reference text,
  -- Se guarda aparte del total para poder responder "¿cuánto fue de flete?"
  -- sin recalcular con las tarifas de hoy, que pueden haber cambiado.
  add column if not exists shipping_cost      numeric(12,2) not null default 0;

notify pgrst, 'reload schema';
