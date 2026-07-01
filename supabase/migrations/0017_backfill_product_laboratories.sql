-- 0017: backfill NO destructivo de laboratory_id en productos existentes.
--
-- Asigna laboratorio SOLO a productos con laboratory_id NULL, según el nombre
-- del producto (patrón por marca/laboratorio). NUNCA sobreescribe uno existente.
-- Idempotente: re-ejecutar no cambia los ya asignados. No borra, no resetea.
--
-- Primero asegura ACM e Isispharma (no estaban en la semilla 0016).

insert into laboratories (business_id, name, country)
select b.id, v.name, v.country
from businesses b
cross join (values ('ACM', 'Francia'), ('Isispharma', 'Francia')) as v(name, country)
where not exists (
  select 1 from laboratories l where l.business_id = b.id and lower(l.name) = lower(v.name)
);

with alias(lab_name, pat) as (values
  ('ISDIN', '%isdin%'),
  ('La Roche-Posay', '%la roche%'),
  ('La Roche-Posay', '%roche-posay%'),
  ('La Roche-Posay', '%lrp%'),
  ('Eucerin', '%eucerin%'),
  ('Avène', '%avène%'),
  ('Avène', '%avene%'),
  ('Bioderma', '%bioderma%'),
  ('CeraVe', '%cerave%'),
  ('CeraVe', '%cera ve%'),
  ('A-Derma', '%a-derma%'),
  ('A-Derma', '%aderma%'),
  ('Sesderma', '%sesderma%'),
  ('Uriage', '%uriage%'),
  ('Heliocare', '%heliocare%'),
  ('ACM', '%acm%'),
  ('Isispharma', '%isispharma%'),
  ('Isispharma', '%isis pharma%'),
  ('Ducray', '%ducray%'),
  ('Vichy', '%vichy%'),
  ('Mustela', '%mustela%'),
  ('Cetaphil', '%cetaphil%'),
  ('Galderma', '%galderma%'),
  ('SVR', '%svr%'),
  ('Filorga', '%filorga%'),
  ('MartiDerm', '%martiderm%'),
  ('MartiDerm', '%marti derm%'),
  ('Neostrata', '%neostrata%'),
  ('Neostrata', '%neo strata%'),
  ('SkinCeuticals', '%skinceuticals%'),
  ('SkinCeuticals', '%skin ceuticals%')
)
update products p
set laboratory_id = l.id, updated_at = now()
from alias a
join laboratories l on lower(l.name) = lower(a.lab_name) and l.business_id = p.business_id
where p.laboratory_id is null
  and p.deleted_at is null
  and lower(p.name) like a.pat;

-- Resumen (informativo): correr aparte para ver el resultado.
-- select count(*) total, count(laboratory_id) con_lab,
--        count(*)-count(laboratory_id) sin_lab
-- from products where deleted_at is null;
