-- 0033_laboratory_shelf_life.sql
-- Regla de vencimiento por laboratorio: días mínimos de vida útil exigidos al
-- RECIBIR productos de este laboratorio. NULL = sin regla (usa el default global
-- de 30 días). Aditiva y nullable → sin impacto en datos existentes.

alter table public.laboratories
  add column if not exists min_shelf_life_days integer
  check (min_shelf_life_days is null or min_shelf_life_days >= 0);

comment on column public.laboratories.min_shelf_life_days is
  'Días mínimos de vida útil al recibir productos de este laboratorio. NULL = sin regla (usa default global de 30 días).';
