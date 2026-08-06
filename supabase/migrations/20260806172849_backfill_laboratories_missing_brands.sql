-- Backfill de laboratorios faltantes y vinculación por marca (brand_id).
--
-- 0017 solo asignaba laboratory_id por texto libre del nombre del producto,
-- y su lista de 30 patrones nunca cubrió la mayoría de marcas reales del
-- catálogo. El dato limpio ya existe: la mayoría de los productos sin
-- laboratorio SÍ tienen brand_id poblado, solo que no existe una fila en
-- `laboratories` con el nombre de esa marca. Esta migración:
--
--   1. Crea un laboratorio por cada una de las 12 marcas que hoy no tienen
--      uno, para CADA negocio (mismo patrón multi-tenant de 0016).
--   2. Vincula products.laboratory_id -> laboratories.id por
--      brand_id -> brands.name = laboratories.name (case-insensitive),
--      SOLO donde laboratory_id es null. Nunca sobreescribe uno existente.
--
-- `country` y `min_shelf_life_days` quedan en NULL a propósito: no son datos
-- que se puedan derivar con certeza del catálogo, y min_shelf_life_days es
-- política de negocio (acuerdos de recepción con cada proveedor) que decide
-- el dueño del negocio, no una migración. Igual que 67 de los 68
-- laboratorios ya sembrados en 0016, quedan sin umbral hasta que se
-- configuren a mano en Configuración → Laboratorios.
--
-- Idempotente: re-ejecutar no crea duplicados (dedup por nombre en
-- minúsculas) ni sobreescribe un laboratory_id ya asignado.

insert into laboratories (business_id, name, country)
select b.id, v.name, null
from businesses b
cross join (values
  ('IDCP'),
  ('Medihealth'),
  ('Babé'),
  ('Sensilis'),
  ('Primaderm'),
  ('Darrow'),
  ('EltaMD'),
  ('Colorescience'),
  ('Rilastil'),
  ('Neutrogena'),
  ('Pilopeptan'),
  ('Abravia')
) as v(name)
where not exists (
  select 1 from laboratories l where l.business_id = b.id and lower(l.name) = lower(v.name)
);

update products p
set laboratory_id = l.id, updated_at = now()
from brands br
join laboratories l on lower(l.name) = lower(br.name) and l.business_id = br.business_id
where p.brand_id = br.id
  and p.laboratory_id is null
  and p.deleted_at is null
  and l.business_id = p.business_id;
