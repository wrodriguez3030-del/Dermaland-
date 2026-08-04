-- 0036_storefront_web_catalog — Fase 1 de la tienda en línea (/tienda).
--
-- Añade DOS tablas nuevas, UN índice y UNA columna nullable. No borra ni
-- modifica ningún dato. Idempotente de principio a fin.
--
--   · business_web_settings — configuración de la tienda POR NEGOCIO. Su columna
--     `storefront_enabled` es el resolutor canónico del tenant en las rutas
--     públicas (que no tienen sesión de la que sacar el business_id). Un índice
--     único parcial garantiza que como MÁXIMO un negocio la tenga activa.
--
--   · product_web_meta — metadatos web 1:1 OPCIONAL con products.
--     LA AUSENCIA DE FILA SIGNIFICA "NO PUBLICADO" (fail-closed): publicar es un
--     acto deliberado del negocio, no un efecto secundario de existir en el
--     catálogo. Así ningún producto con precio o foto dudosa llega a internet
--     por omisión.
--
-- Por qué tabla aparte y no columnas en `products`: products es el núcleo
-- operativo-fiscal (POS, DGII, inventario, compras, emit_sale_atomic) y su
-- `list` hace select("*"). Meterle contenido editorial obligaría a tocar tipos,
-- mappers, la lista blanca de update y los formularios, y haría que el ERP
-- arrastrara descripciones largas en cada consulta.
--
-- RLS deny-by-default: política de tenant solo para `authenticated`. A `anon` se
-- le REVOCA explícitamente, porque la clave anónima viaja en el navegador y la
-- tienda pública NO lee con ella (lee con un servicio de servidor acotado, el
-- mismo patrón de server/services/sales/shared-document.ts para /factura/[token]).
--
-- PREVISTO Y NO IMPLEMENTADO (nada aquí lo estorba): web_carts, web_orders
-- (que se materializarán como `proformas` con el motor existente), web_addresses,
-- shipping_zones. Y para las cuentas de cliente: NUNCA reutilizar `users` —exige
-- business_id y auth-claims.ts asigna rol "cashier" por defecto, así que un
-- cliente final quedaría como cajero—; debe ser una tabla puente propia
-- `client_auth_links(auth_user_id, business_id, client_id)`.

-- ── 1) Clave candidata compuesta para la FK de tenant ────────────────────────
-- No añade columnas. Permite que product_web_meta referencie (business_id,
-- product_id) y la base impida por sí sola que un metadato apunte a un producto
-- de otro negocio.
create unique index if not exists products_business_id_id_key
  on public.products (business_id, id);

-- ── 2) Configuración de la tienda por negocio ────────────────────────────────
create table if not exists public.business_web_settings (
  business_id        uuid primary key references public.businesses(id) on delete cascade,
  storefront_enabled boolean not null default false,
  site_name          text not null default 'DermaLand',
  tagline            text,
  seo_title          text,
  seo_description    text,
  og_image_url       text,
  whatsapp_phone     text,
  contact_email      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

comment on table public.business_web_settings is
  'Configuración de la tienda pública por negocio. `storefront_enabled` es el resolutor canónico del tenant en rutas sin sesión: a lo sumo UN negocio puede tenerlo activo.';

-- INVARIANTE: como máximo UNA tienda publicada en toda la plataforma.
-- Convierte "hay un solo negocio operativo" de heurística en garantía de base.
-- Para habilitar multi-tienda en el futuro: eliminar este índice y resolver por
-- host (columna `public_host` + búsqueda por la cabecera Host).
create unique index if not exists business_web_settings_single_storefront
  on public.business_web_settings (storefront_enabled)
  where storefront_enabled;

-- ── 3) Metadatos web del producto (1:1 opcional) ─────────────────────────────
create table if not exists public.product_web_meta (
  product_id          uuid primary key,
  business_id         uuid not null,
  slug                text not null,
  visible             boolean not null default false,
  featured            boolean not null default false,
  is_new              boolean not null default false,
  sort_order          integer not null default 0,
  web_title           text,   -- título comercial: products.name viene en MAYÚSCULAS
  web_summary         text,   -- una o dos líneas para la tarjeta del catálogo
  web_description     text,   -- texto largo de la ficha
  benefits            text[] not null default '{}',
  how_to_use          text,
  seo_title           text,
  seo_description     text,
  image_alt           text,
  related_product_ids uuid[] not null default '{}',
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  constraint product_web_meta_product_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id) on delete cascade,
  -- El formato lo produce features/storefront/slug.ts; el CHECK impide que
  -- entre por otra vía algo que rompería las URLs.
  constraint product_web_meta_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  constraint product_web_meta_related_max
    check (array_length(related_product_ids, 1) is null
           or array_length(related_product_ids, 1) <= 8),
  constraint product_web_meta_benefits_max
    check (array_length(benefits, 1) is null or array_length(benefits, 1) <= 8)
);

comment on table public.product_web_meta is
  'Metadatos de la tienda por producto. La AUSENCIA de fila significa NO publicado. El slug es estable: se genera al publicar y no se regenera al renombrar el producto, para no romper enlaces ni indexación.';

create unique index if not exists product_web_meta_slug_unique
  on public.product_web_meta (business_id, slug);
create index if not exists product_web_meta_visible_idx
  on public.product_web_meta (business_id, sort_order) where visible;
create index if not exists product_web_meta_featured_idx
  on public.product_web_meta (business_id) where visible and featured;

-- ── 4) Nombre público de la sucursal ─────────────────────────────────────────
-- El sistema las llama "DermaLand Principal" y "Dermaland Cutis"; el negocio las
-- anuncia como "E. León Jiménez" y "Cutis". Se separa el nombre interno del
-- comercial en vez de renombrar, para no alterar documentos ni informes.
alter table public.branches add column if not exists public_name text;
comment on column public.branches.public_name is
  'Nombre de cara al público en la tienda en línea. Si es null se usa `name`.';

-- ── 5) RLS deny-by-default ───────────────────────────────────────────────────
alter table public.business_web_settings enable row level security;
alter table public.product_web_meta      enable row level security;

drop policy if exists business_web_settings_tenant on public.business_web_settings;
create policy business_web_settings_tenant on public.business_web_settings
  for all to authenticated
  using      (business_id = (select auth_business_id()))
  with check (business_id = (select auth_business_id()));

drop policy if exists product_web_meta_tenant on public.product_web_meta;
create policy product_web_meta_tenant on public.product_web_meta
  for all to authenticated
  using      (business_id = (select auth_business_id()))
  with check (business_id = (select auth_business_id()));

-- ── 6) Privilegios: `anon` no toca estas tablas ──────────────────────────────
-- Necesario porque Supabase concede privilegios por defecto a anon sobre las
-- tablas nuevas del esquema public.
revoke all on public.business_web_settings from anon;
revoke all on public.product_web_meta      from anon;
grant select, insert, update, delete on public.business_web_settings to authenticated, service_role;
grant select, insert, update, delete on public.product_web_meta      to authenticated, service_role;

notify pgrst, 'reload schema';
