-- Enlace de Link de Pagos de Azul generado PARA ESTE PEDIDO (monto exacto).
-- NULL = todavía no se generó. El de business_web_settings es solo el
-- interruptor de "la tienda acepta tarjeta"; al cliente se le enseña ESTE.
-- La validación del dominio vive en la aplicación
-- (features/storefront/azul-link.ts).
alter table public.web_orders
  add column if not exists azul_payment_link_url text;
