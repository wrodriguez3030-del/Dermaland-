-- Enlace de Google Maps e Instagram por sucursal.
--
-- La tienda ya listaba la dirección escrita en el pie, pero en Santiago una
-- dirección escrita no siempre lleva a la puerta: hay calles sin número y
-- sectores donde la referencia real es el colmado de la esquina. Un enlace de
-- Google Maps convierte «cómo llego» en un toque.
--
-- Son columnas de TEXTO, no de URL validada: Postgres no valida URLs y fingir
-- que sí (con un CHECK de expresión regular) daría una garantía falsa —el
-- patrón se queda corto o rechaza enlaces legítimos, y los de Maps cambian de
-- forma cada tanto—. La normalización vive en la aplicación
-- (`features/tenancy/branch-links.ts`), donde puede explicar el error al
-- usuario y donde está cubierta por pruebas.
--
-- Lo que SÍ se defiende aquí es el tamaño: los enlaces de Maps con coordenadas
-- y parámetros son largos, pero no de kilobytes. El tope corta el pegado
-- accidental de un documento entero en el campo.

alter table public.branches
  add column if not exists maps_url text,
  add column if not exists instagram_url text;

alter table public.branches
  drop constraint if exists branches_maps_url_len;
alter table public.branches
  add constraint branches_maps_url_len
  check (maps_url is null or char_length(maps_url) <= 2048);

alter table public.branches
  drop constraint if exists branches_instagram_url_len;
alter table public.branches
  add constraint branches_instagram_url_len
  check (instagram_url is null or char_length(instagram_url) <= 300);

comment on column public.branches.maps_url is
  'Enlace de Google Maps de la sucursal, ya normalizado por la app. Se muestra como «Cómo llegar» en el pie de la tienda.';
comment on column public.branches.instagram_url is
  'Perfil de Instagram de la sucursal, normalizado a https://www.instagram.com/<usuario>.';

notify pgrst, 'reload schema';
