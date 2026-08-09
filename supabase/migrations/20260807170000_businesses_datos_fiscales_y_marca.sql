-- Datos de la empresa que la pantalla Administración → Empresa decía editar.
--
-- La pantalla existía desde el principio con su botón «Guardar cambios», pero
-- no había ni columnas ni API detrás: leía datos de prueba y el botón no hacía
-- nada. Estos seis campos son los que faltaban en la tabla.
--
-- `address`, `city` y `province` salen en facturas y comprobantes; `website`,
-- `slogan` y `description` son de marca.

alter table public.businesses
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists slogan text,
  add column if not exists description text;

alter table public.businesses drop constraint if exists businesses_website_len;
alter table public.businesses add constraint businesses_website_len
  check (website is null or char_length(website) <= 500);

alter table public.businesses drop constraint if exists businesses_slogan_len;
alter table public.businesses add constraint businesses_slogan_len
  check (slogan is null or char_length(slogan) <= 160);

alter table public.businesses drop constraint if exists businesses_description_len;
alter table public.businesses add constraint businesses_description_len
  check (description is null or char_length(description) <= 2000);

comment on column public.businesses.website is 'Sitio web público del negocio, normalizado por la app.';
comment on column public.businesses.address is 'Dirección fiscal. Sale en facturas y comprobantes.';
comment on column public.businesses.slogan is 'Eslogan comercial corto, usado en documentos y la tienda.';

notify pgrst, 'reload schema';
