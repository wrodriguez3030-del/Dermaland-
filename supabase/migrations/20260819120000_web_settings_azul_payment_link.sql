-- El enlace de pago de Azul del comercio (pagos.azul.com.do/...). NULL o vacío
-- = no se ofrece tarjeta en la tienda. La validación del formato vive en la
-- aplicación (features/storefront/azul-link.ts).
alter table public.business_web_settings
  add column if not exists azul_payment_link_url text;
