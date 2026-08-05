-- 0043 — Qué sucursal despacha y factura los pedidos web.
--
-- POR QUÉ
--
-- El pedido guarda la sucursal que eligió el cliente para retirar. En un ENVÍO
-- esa sucursal no significa nada: el cliente no va a pisarla, y la que quedó
-- guardada es la que la tienda puso por defecto.
--
-- Peor aún: `Dermaland Cutis` está anunciada en la tienda con **cero lotes**.
-- Todo el inventario vive en `DermaLand Principal`. Facturar obedientemente en
-- la sucursal del pedido abría el POS con el carrito vacío y dos avisos.
--
-- Adivinarlo por existencia funcionaba, pero es frágil: el día que Cutis reciba
-- tres cajas, la facturación se mudaría sola sin que nadie lo decidiera. Esto
-- es una decisión del negocio y se escribe como tal.
--
-- No se usa `is_pilot` ni el nombre: `is_pilot` significa otra cosa y el nombre
-- se cambia. Una columna propia dice exactamente lo que dice.

begin;

alter table public.branches
  add column if not exists is_web_fulfillment boolean not null default false;

comment on column public.branches.is_web_fulfillment is
  'Sucursal desde la que se despachan y facturan los pedidos de la tienda en línea. Como mucho una por negocio.';

-- Una sola por negocio: dos "la que despacha" no es una decisión, es un empate.
create unique index if not exists branches_one_web_fulfillment_per_business
  on public.branches (business_id)
  where is_web_fulfillment and deleted_at is null;

commit;

notify pgrst, 'reload schema';
