-- 20260805020813_ecf_events_fk_restrict.sql
--
-- RECONSTRUIDO 2026-08-05 desde la definicion viva de la base.
-- Esta migracion se aplico en su dia con `apply_migration` del MCP y nunca
-- dejo un .sql en el repositorio, de modo que supabase/migrations/ no podia
-- reconstruir el esquema desde cero. El registro en
-- supabase_migrations.schema_migrations YA EXISTE (version 20260805020813):
-- este archivo NO debe reaplicarse en produccion, solo permitir levantar el
-- esquema de cero. Idempotente a proposito.
--
-- EL NOMBRE ES LA IDENTIDAD REGISTRADA, no una numeracion inventada. La CLI de
-- Supabase lista las migraciones locales con /^([0-9]+)_(.*)\.sql$/ y SALTA en
-- silencio (solo aviso por stderr) las que no casan. Con el nombre a secas,
-- `supabase db push` — el procedimiento de docs/supabase-setup.md — ignoraba
-- este archivo y reconstruia una base incompleta. Con el prefijo
-- `20260805020813_` la CLI deriva exactamente la version y el nombre que ya
-- guarda supabase_migrations.schema_migrations, asi que el viaje de ida y
-- vuelta es exacto.
--
-- FUENTE: el SQL literal guardado en
-- supabase_migrations.schema_migrations.statements para esa version,
-- contrastado contra pg_constraint, donde hoy se lee
-- `FOREIGN KEY (electronic_invoice_id) REFERENCES electronic_invoices(id)
-- ON DELETE RESTRICT` (confdeltype = 'r'). El cuerpo va LITERAL: el par
-- `drop constraint if exists` + `add constraint` ya es idempotente.
--
-- Ajusta una clave foranea que creo 0045_ecf_idempotency_and_events; con el
-- prefijo de version se aplica al final de la secuencia, que es donde debe ir.

-- El CASCADE era una trampa: borrar un comprobante intentaba borrar su historial,
-- el disparador append-only lo impedia, y el mensaje que salia hablaba de
-- "append-only" en vez de decir lo que pasa. RESTRICT dice la verdad: un
-- comprobante con historial fiscal no se borra.
alter table public.ecf_document_events
  drop constraint if exists ecf_document_events_electronic_invoice_id_fkey;

alter table public.ecf_document_events
  add constraint ecf_document_events_electronic_invoice_id_fkey
  foreign key (electronic_invoice_id)
  references public.electronic_invoices(id)
  on delete restrict;
