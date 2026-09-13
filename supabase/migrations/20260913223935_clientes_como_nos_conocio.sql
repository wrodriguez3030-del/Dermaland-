-- =============================================================================
-- DermaLand · "¿Cómo nos conoció?" en Clientes
-- =============================================================================
-- Aditiva y no destructiva: columna nueva, nullable, sin tocar filas
-- existentes. No requiere RLS nueva (clients ya tiene su política por
-- business_id) ni backfill: los 6 525 clientes actuales quedan en NULL hasta
-- que se edite la ficha o se cree un cliente nuevo con el dato.

alter table clients
  add column if not exists referral_source text;

comment on column clients.referral_source is
  'Cómo nos conoció el cliente (marketing/atribución): Instagram, Facebook, un médico referente, etc. Texto libre — distinto de "source", que es el origen del REGISTRO en el sistema (manual/whatsapp/web/import/agendapro/alegra).';
