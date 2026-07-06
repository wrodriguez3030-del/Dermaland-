-- ─── 0022 · Relaciones cliente↔ventas + índices de rendimiento ──────────────
-- 100% ADITIVA e idempotente. NO borra ni modifica datos. NO toca DGII real,
-- testecf, certecf, certificados ni secuencias fiscales.
--
-- 1. `proformas.source_proforma_id`: enlace explícito proforma→factura.
--    Cuando una proforma se factura después (documento nuevo), la factura
--    referencia a la proforma origen. Las métricas de cliente cuentan SOLO
--    el documento final (la proforma origen no suma dos veces).
-- 2. Índices que faltaban para las consultas del módulo de Clientes:
--    - compras por cliente (perfil): (business_id, customer_id, created_at desc)
--    - listados/metrics por fecha:   (business_id, created_at desc)
--    - resolución de conversiones:   parcial sobre source_proforma_id

alter table proformas
  add column if not exists source_proforma_id uuid references proformas(id);

comment on column proformas.source_proforma_id is
  'Proforma origen cuando este documento es la factura que la convierte. '
  'Métricas cuentan solo el documento final (anti doble conteo).';

create index if not exists proformas_business_customer_idx
  on proformas(business_id, customer_id, created_at desc)
  where customer_id is not null;

create index if not exists proformas_business_created_idx
  on proformas(business_id, created_at desc);

create index if not exists proformas_source_proforma_idx
  on proformas(business_id, source_proforma_id)
  where source_proforma_id is not null;
