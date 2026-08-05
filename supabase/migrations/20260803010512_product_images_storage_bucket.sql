-- 20260803010512_product_images_storage_bucket.sql
--
-- RECONSTRUIDO 2026-08-05 desde la definicion viva de la base.
-- Esta migracion se aplico en su dia con `apply_migration` del MCP y nunca
-- dejo un .sql en el repositorio, de modo que supabase/migrations/ no podia
-- reconstruir el esquema desde cero. El registro en
-- supabase_migrations.schema_migrations YA EXISTE (version 20260803010512):
-- este archivo NO debe reaplicarse en produccion, solo permitir levantar el
-- esquema de cero. Idempotente a proposito.
--
-- EL NOMBRE ES LA IDENTIDAD REGISTRADA, no una numeracion inventada. La CLI de
-- Supabase lista las migraciones locales con /^([0-9]+)_(.*)\.sql$/ y SALTA en
-- silencio (solo aviso por stderr) las que no casan. Con el nombre a secas,
-- `supabase db push` — el procedimiento de docs/supabase-setup.md — ignoraba
-- este archivo y reconstruia una base incompleta. Con el prefijo
-- `20260803010512_` la CLI deriva exactamente la version y el nombre que ya
-- guarda supabase_migrations.schema_migrations, asi que el viaje de ida y
-- vuelta es exacto.
--
-- FUENTE: el SQL literal guardado en
-- supabase_migrations.schema_migrations.statements para esa version,
-- contrastado contra storage.buckets (id, name, public,
-- file_size_limit=3145728, allowed_mime_types) y contra pg_policies sobre
-- storage.objects. El cuerpo va LITERAL, sin tocar una coma: el SQL registrado
-- ya era idempotente (`on conflict do nothing` + `drop policy if exists`).

-- Bucket público para las fotos de producto de la tienda en línea.
-- Aditivo y reversible: no toca ninguna tabla ni dato existente.
--
-- Público en LECTURA a propósito: son fotos de catálogo que se sirven en
-- páginas públicas de la tienda y deben poder cachearse en CDN sin firmar URL.
-- La ESCRITURA queda restringida a service_role (scripts de carga masiva) y a
-- usuarios autenticados del negocio.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  3145728, -- 3 MB por archivo
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Lectura pública (catálogo de la tienda).
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Escritura solo para usuarios autenticados (el panel) — service_role la salta
-- por diseño, que es lo que usan los scripts de carga masiva.
drop policy if exists "product_images_auth_insert" on storage.objects;
create policy "product_images_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "product_images_auth_update" on storage.objects;
create policy "product_images_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product_images_auth_delete" on storage.objects;
create policy "product_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');
