-- =============================================================================
-- DermaLand · Cableado del POS a numeración servidor (Fase C — parte 2)
-- =============================================================================
-- Requiere 0011_invoice_numberings.sql aplicada (tabla + RPC
-- reserve_invoice_number). Esta migración:
--  1. Agrega a `proformas` las columnas de trazabilidad de la reserva:
--     numbering_id + sequence_environment.
--  2. Siembra las numeraciones del negocio en `invoice_numberings`,
--     espejo de los seeds del store local PERO con `next_number` POR ENCIMA
--     del máximo ya emitido en la DB (B0200001247, E3200000095 al
--     2026-07-03) + margen para contadores localStorage adelantados en
--     otros dispositivos.
--
-- NO destructiva. NO toca DGII real (ambientes mock/testecf; la RPC y el
-- endpoint rechazan `produccion`).

alter table proformas
  add column if not exists numbering_id uuid references invoice_numberings(id),
  add column if not exists sequence_environment text;

comment on column proformas.numbering_id is
  'Numeración de invoice_numberings que reservó el comprobante (modo supabase).';
comment on column proformas.sequence_environment is
  'Ambiente de la numeración al reservar (mock/demo/testecf/certecf).';

insert into invoice_numberings
  (business_id, name, document_type, prefix, range_start, range_end,
   next_number, environment, is_electronic, is_preferred, status, end_date, note)
values
  ('00000000-0000-0000-0000-00000000d001', 'Factura de consumo (B02)',
   'consumo', 'B02', 1, 50000, 1300, 'mock', false, true, 'active',
   '2027-12-31', 'Seed servidor 2026-07-03: max emitido en DB B0200001247 + margen'),
  ('00000000-0000-0000-0000-00000000d001', 'Crédito fiscal (B01)',
   'credito_fiscal', 'B01', 1, 20000, 400, 'mock', false, true, 'active',
   '2027-12-31', 'Seed servidor 2026-07-03: sin emisiones en DB; seed local iba por 320 + margen'),
  ('00000000-0000-0000-0000-00000000d001', 'e-CF Consumo (32)',
   'ecf_32', 'E32', 1, 100000, 150, 'testecf', true, true, 'active',
   '2027-12-31', 'Seed servidor 2026-07-03: max emitido en DB E3200000095 + margen'),
  ('00000000-0000-0000-0000-00000000d001', 'e-CF Crédito fiscal (31)',
   'ecf_31', 'E31', 1, 50000, 100, 'testecf', true, true, 'active',
   '2027-12-31', 'Seed servidor 2026-07-03: sin emisiones en DB; seed local iba por 40 + margen'),
  ('00000000-0000-0000-0000-00000000d001', 'e-CF Nota de crédito (34)',
   'ecf_34', 'E34', 1, 10000, 50, 'testecf', true, true, 'active',
   '2027-12-31', 'Seed servidor 2026-07-03: sin emisiones en DB; seed local iba por 5 + margen')
on conflict (business_id, prefix, document_type, environment) do nothing;

notify pgrst, 'reload schema';
