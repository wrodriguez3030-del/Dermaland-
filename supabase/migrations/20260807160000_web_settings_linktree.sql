-- Linktree (o el árbol de enlaces que use el negocio) en la configuración de la
-- tienda.
--
-- Va en `business_web_settings` y no en `businesses` porque es un dato de cara
-- al público: vive junto al nombre del sitio, el lema y el WhatsApp, y comparte
-- con ellos la invalidación de caché al guardar.
--
-- Texto, no URL validada: la normalización vive en la app
-- (`features/tenancy/branch-links.ts`), donde puede explicar el error. Aquí sólo
-- se defiende el tamaño.

alter table public.business_web_settings
  add column if not exists linktree_url text;

alter table public.business_web_settings
  drop constraint if exists business_web_settings_linktree_len;
alter table public.business_web_settings
  add constraint business_web_settings_linktree_len
  check (linktree_url is null or char_length(linktree_url) <= 500);

comment on column public.business_web_settings.linktree_url is
  'Árbol de enlaces del negocio (Linktree, Beacons, su propia web), normalizado por la app. Sale en el pie de la tienda.';

notify pgrst, 'reload schema';
