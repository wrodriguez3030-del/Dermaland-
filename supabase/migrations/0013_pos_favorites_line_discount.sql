-- 0013 — Favoritos de POS + metadatos de descuento por línea (NO destructiva).

-- Favoritos de POS por NEGOCIO: visibles en todas las PCs/sucursales del negocio.
-- (Regla elegida: business_id + product_id. Simple y compartido; no fragmenta por
--  sucursal ni por usuario.)
create table if not exists pos_product_favorites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_id, product_id)
);

alter table pos_product_favorites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pos_product_favorites'
      and policyname = 'pos_product_favorites_all'
  ) then
    create policy pos_product_favorites_all on pos_product_favorites
      for all using (business_id = auth_business_id())
      with check (business_id = auth_business_id());
  end if;
end $$;

-- Descuento por línea: la columna `discount` (monto, base) ya existe en
-- proforma_items. Agregamos los metadatos para reportes/auditoría.
alter table proforma_items add column if not exists discount_type text;
alter table proforma_items add column if not exists discount_value numeric(14,2) not null default 0;
alter table proforma_items add column if not exists discount_reason text;

notify pgrst, 'reload schema';
