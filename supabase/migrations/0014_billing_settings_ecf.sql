-- =============================================================================
-- DermaLand · Configuración de facturación + e-CF de cierre de caja
-- =============================================================================
-- ADITIVA y NO destructiva: usa `create table if not exists` y
-- `add column if not exists`. NO toca dgii_settings, ecf_sequences ni
-- invoice_numberings existentes. RLS por business_id.
--
-- IMPORTANTE — DGII real apagado:
--  * `real_emission_enabled` arranca false; `ecf_environment` arranca 'mock'.
--  * Ningún flujo emite comprobantes fiscales reales hasta autorización
--    explícita. mock/demo nunca consume secuencia fiscal real.
--
-- Esta migración NO se aplica a ninguna base real en este cambio; la app
-- corre en DATA_SOURCE=mock (localStorage). Se versiona para cuando se
-- promueva a Supabase con RLS.

-- ─── billing_settings ────────────────────────────────────────────────────────
create table if not exists billing_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  default_billing_mode text not null default 'both'
    check (default_billing_mode in ('ncf','ecf','both')),
  usage_mode text not null default 'automatic'
    check (usage_mode in ('manual','automatic')),
  ecf_environment text not null default 'mock'
    check (ecf_environment in ('mock','demo','testecf','certecf','produccion')),
  real_emission_enabled boolean not null default false,
  card_ecf_immediate_enabled boolean not null default true,
  cash_transfer_ecf_closing_enabled boolean not null default true,
  cash_transfer_ecf_percentage numeric(5,2) not null default 15
    check (cash_transfer_ecf_percentage >= 0 and cash_transfer_ecf_percentage <= 100),
  cash_transfer_selection_strategy text not null default 'last'
    check (cash_transfer_selection_strategy in ('last','first','manual')),
  default_consumer_ecf_type text not null default 'E32'
    check (default_consumer_ecf_type in ('E32')),
  default_rnc_ecf_type text not null default 'E31'
    check (default_rnc_ecf_type in ('E31')),
  -- Seguridad: emisión real sólo permitida en ambiente produccion.
  constraint billing_settings_real_emission_guard
    check (not real_emission_enabled or ecf_environment = 'produccion'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_settings enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'billing_settings'
      and policyname = 'billing_settings_all'
  ) then
    create policy billing_settings_all on billing_settings for all
      using (business_id = auth_business_id())
      with check (business_id = auth_business_id());
  end if;
end $$;

-- ─── cash_closings: columnas e-CF (snapshot inmutable por cierre) ─────────────
-- La tabla cash_closings se crea en 0003; aquí sólo añadimos columnas.
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_name = 'cash_closings') then
    alter table cash_closings
      add column if not exists ecf_percentage numeric(5,2),
      add column if not exists ecf_strategy text,
      add column if not exists ecf_target_amount numeric(14,2),
      add column if not exists ecf_generated_amount numeric(14,2),
      add column if not exists ecf_pending_amount numeric(14,2),
      add column if not exists ecf_rounding_difference numeric(14,2),
      add column if not exists ecf_generation_status text;
  end if;
end $$;

-- ─── cash_closing_ecf_items ──────────────────────────────────────────────────
create table if not exists cash_closing_ecf_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  cash_closing_id uuid not null,
  invoice_id uuid,
  sale_id uuid,
  payment_method text,
  sale_amount numeric(14,2) not null default 0,
  selected_for_ecf boolean not null default false,
  ecf_invoice_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists cash_closing_ecf_items_closing_idx
  on cash_closing_ecf_items (business_id, cash_closing_id);

alter table cash_closing_ecf_items enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'cash_closing_ecf_items'
      and policyname = 'cash_closing_ecf_items_all'
  ) then
    create policy cash_closing_ecf_items_all on cash_closing_ecf_items for all
      using (business_id = auth_business_id())
      with check (business_id = auth_business_id());
  end if;
end $$;

-- ─── dgii_logs ───────────────────────────────────────────────────────────────
create table if not exists dgii_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  invoice_id uuid,
  action text not null,
  environment text,
  status text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists dgii_logs_business_idx
  on dgii_logs (business_id, created_at desc);

alter table dgii_logs enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'dgii_logs'
      and policyname = 'dgii_logs_all'
  ) then
    create policy dgii_logs_all on dgii_logs for all
      using (business_id = auth_business_id())
      with check (business_id = auth_business_id());
  end if;
end $$;

-- Las columnas de issued_invoices (billing_mode, document_type, ncf, ecf,
-- sequence_id, dgii_status, dgii_tracking_id, security_code, qr_url, xml_path,
-- signed_xml_path, ri_pdf_path, dgii_response_path, sent_to_receiver_at,
-- receiver_ack_status, commercial_approval_status, ecf_generated_at,
-- ecf_generation_source, cash_closing_id) ya están cubiertas por proformas +
-- ecf_sequences en 0003. Cuando se cree la tabla issued_invoices dedicada se
-- añadirán en una migración posterior para no romper el modelo actual.

notify pgrst, 'reload schema';
