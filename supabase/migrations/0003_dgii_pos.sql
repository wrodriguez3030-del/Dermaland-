-- =============================================================================
-- DermaLand · Fase 3 (DGII Fase B) — DGII e-CF + POS fiscal
-- =============================================================================
-- Tablas para facturación electrónica DGII (e-CF) y POS fiscal (proformas,
-- caja, cierres). Convención: snake_case, RLS por tenant con
-- `auth_business_id()` desde JWT (definido en 0001_phase1_core.sql).
--
-- Esta migración NO se aplica automáticamente. Para aplicarla:
--   supabase db push
-- o ejecutarla manualmente desde el dashboard SQL editor.
--
-- NO crea seeds de permisos, ni inserta datos reales. NO modifica
-- `dgii_enabled` en `businesses`. NO toca `DATA_SOURCE`. Compatible con la
-- ruta DATA_SOURCE=mock (que ignora estas tablas).
--
-- Mapeos camelCase ↔ snake_case se manejan en
-- `apps/web/src/server/repositories/supabase/mappers.ts` (pendiente).
--
-- Referencia funcional: `docs/dgii/plan-integracion-dgii.md` Fase B.
-- =============================================================================

-- ─── Settings DGII por business ─────────────────────────────────────────────

create table if not exists dgii_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,

  -- Datos del emisor (espejo de businesses + extras requeridos por DGII)
  rnc_emisor text not null,
  razon_social_emisor text not null,
  nombre_comercial text,
  direccion_emisor text not null,
  municipio text,
  provincia text,
  actividad_economica text,
  telefono_emisor text,
  correo_emisor text,
  website text,

  -- Ambiente DGII (testecf | certecf | ecf). NUNCA ecf sin autorización
  -- explícita; bloqueado por dgii_enabled_real_send.
  ambiente text not null default 'testecf'
    check (ambiente in ('testecf','certecf','ecf')),
  dgii_enabled_real_send boolean not null default false,

  -- URLs base por ambiente (configurables; valores oficiales sujetos a
  -- validación contra documentación DGII vigente). NO hardcodear en código.
  base_url_testecf text not null default 'https://ecf.dgii.gov.do/testecf',
  base_url_certecf text not null default 'https://ecf.dgii.gov.do/certecf',
  base_url_ecf text not null default 'https://ecf.dgii.gov.do/ecf',

  -- Regla del porcentaje de proformas a convertir en cierre de caja.
  -- Valores los define el contador; NO inventar defaults fiscales.
  default_cash_closing_ecf_percentage numeric(5,2) not null default 0
    check (default_cash_closing_ecf_percentage between 0 and 100),
  allow_user_change_closing_percentage boolean not null default false,
  minimum_closing_ecf_percentage numeric(5,2) not null default 0
    check (minimum_closing_ecf_percentage between 0 and 100),
  maximum_closing_ecf_percentage numeric(5,2) not null default 100
    check (maximum_closing_ecf_percentage between 0 and 100),
  require_admin_authorization_below_100_percent boolean not null default true,
  auto_generate_ecf_on_cash_closing boolean not null default false,
  applies_to_payment_methods text[] not null default array['cash','transfer'],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dgii_settings_percentage_range
    check (minimum_closing_ecf_percentage <= maximum_closing_ecf_percentage)
);
alter table dgii_settings enable row level security;
create policy dgii_settings_all on dgii_settings for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Certificados digitales (metadata; nunca password en claro) ─────────────

create table if not exists dgii_certificates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  alias text not null,
  subject_dn text,
  issuer_dn text,
  serial_number text,
  valid_from timestamptz,
  valid_to timestamptz,

  -- Una sola de estas dos se usará:
  --  1) blob cifrado AES-256-GCM en Supabase Storage (preferido).
  pkcs12_storage_bucket text default 'certificates',
  pkcs12_storage_path text,
  --  2) blob cifrado en columna (fallback; tamaño limitado).
  pkcs12_encrypted_blob bytea,
  kdf text,
  iv bytea,
  tag bytea,

  -- Referencia simbólica al secreto que guarda la password (Vercel Env,
  -- Supabase Vault, KMS). NUNCA el valor en sí.
  password_secret_ref text not null,

  is_active boolean not null default false,
  revoked_at timestamptz,
  uploaded_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Sólo un cert activo por business a la vez.
  constraint dgii_certificates_one_active
    exclude (business_id with =) where (is_active = true)
);
create index if not exists dgii_certificates_business_idx
  on dgii_certificates(business_id);
alter table dgii_certificates enable row level security;
create policy dgii_certificates_all on dgii_certificates for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Secuencias e-NCF (rangos autorizados por DGII) ─────────────────────────

create table if not exists ecf_sequences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  tipo_ecf text not null
    check (tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')),
  prefix text not null,                        -- e.g. 'E31'
  range_start int not null,
  range_end int not null,
  next_number int not null,
  fecha_vencimiento date not null,
  ambiente text not null
    check (ambiente in ('testecf','certecf','ecf')),
  status text not null default 'active'
    check (status in ('active','expiring','exhausted','expired','cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ecf_sequences_range_ok check (range_end >= range_start),
  constraint ecf_sequences_next_ok
    check (next_number >= range_start and next_number <= range_end + 1)
);
create unique index if not exists ecf_sequences_unique
  on ecf_sequences(business_id, tipo_ecf, ambiente, range_start);
create index if not exists ecf_sequences_business_idx
  on ecf_sequences(business_id, tipo_ecf, ambiente, status);
alter table ecf_sequences enable row level security;
create policy ecf_sequences_all on ecf_sequences for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Avanza next_number atómicamente y devuelve el número reservado.
-- Devuelve null si no hay secuencia disponible.
create or replace function public.reserve_ecf_sequence_number(
  p_business_id uuid,
  p_tipo_ecf text,
  p_ambiente text
) returns int
  language plpgsql
  as $$
declare
  v_seq_id uuid;
  v_next int;
  v_range_end int;
begin
  select id, next_number, range_end
    into v_seq_id, v_next, v_range_end
  from ecf_sequences
  where business_id = p_business_id
    and tipo_ecf = p_tipo_ecf
    and ambiente = p_ambiente
    and status = 'active'
    and next_number <= range_end
  order by created_at asc
  limit 1
  for update;

  if v_seq_id is null then
    return null;
  end if;

  if v_next + 1 > v_range_end then
    update ecf_sequences
      set next_number = v_next + 1,
          status = 'exhausted',
          updated_at = now()
      where id = v_seq_id;
  else
    update ecf_sequences
      set next_number = v_next + 1,
          updated_at = now()
      where id = v_seq_id;
  end if;

  return v_next;
end;
$$;

-- ─── Catálogo de formas de pago ─────────────────────────────────────────────

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  code text not null,
  label text not null,
  -- Tarjetas / link / POS bancario → e-CF inmediato. Cash / transfer →
  -- proforma. Confirmar con contador la asignación final.
  requires_immediate_ecf boolean not null default false,
  default_ecf_type text
    check (default_ecf_type in ('31','32','33','34','41','43','44','45','46','47')),
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);
alter table payment_methods enable row level security;
create policy payment_methods_all on payment_methods for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Cajas y sesiones ──────────────────────────────────────────────────────

create table if not exists cash_registers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,

  code text not null,
  name text not null,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);
alter table cash_registers enable row level security;
create policy cash_registers_all on cash_registers for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  cash_register_id uuid not null references cash_registers(id) on delete cascade,
  session_number text not null,

  opened_by uuid not null references users(id),
  opened_by_name text not null,
  opened_at timestamptz not null default now(),
  opening_amount numeric(14,2) not null default 0,

  closed_by uuid references users(id),
  closed_at timestamptz,
  expected_cash numeric(14,2) not null default 0,
  counted_cash numeric(14,2),
  difference_amount numeric(14,2),

  totals jsonb not null default '{}'::jsonb,
  notes text,

  status text not null default 'open'
    check (status in ('open','closing','closed','reverted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, session_number)
);
create index if not exists cash_register_sessions_business_idx
  on cash_register_sessions(business_id, status, opened_at desc);
alter table cash_register_sessions enable row level security;
create policy cash_register_sessions_all on cash_register_sessions for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Proformas (documento de venta, fiscal o no) ────────────────────────────
-- `document_kind = 'proforma'` → no fiscal (cash/transfer, espera cierre).
-- `document_kind = 'invoice'`  → e-CF emitido directamente (tarjeta/POS).
-- Refleja el tipo en Proforma del TS (proforma|invoice + ecfType).

create table if not exists proformas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  cash_register_session_id uuid references cash_register_sessions(id) on delete set null,

  number text not null,
  customer_id uuid references clients(id),
  customer_name text not null,
  customer_phone text,
  customer_document text,
  cashier_id uuid not null references users(id),
  cashier_name text not null,

  billing_type text
    check (billing_type in ('consumo','credito_fiscal')),
  document_kind text not null default 'proforma'
    check (document_kind in ('proforma','invoice')),
  ecf_type text
    check (ecf_type in ('31','32','33','34')),
  sequence_type text
    check (sequence_type in ('consumo','credito_fiscal')),

  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  discount_percent numeric(5,2),
  discount_amount numeric(14,2),
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  amount_received numeric(14,2),
  change_amount numeric(14,2),

  status text not null default 'draft'
    check (status in (
      'draft','issued','paid','partially_paid','pending_ecf',
      'pending_cash_closing','selected_for_ecf','ecf_generation_pending',
      'converted_to_ecf','closed_without_ecf','cancelled','expired','voided'
    )),

  notes text,
  ecf_number text,
  electronic_invoice_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number)
);
create index if not exists proformas_business_status_idx
  on proformas(business_id, status, created_at desc);
create index if not exists proformas_session_idx
  on proformas(business_id, cash_register_session_id);
alter table proformas enable row level security;
create policy proformas_all on proformas for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists proforma_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  proforma_id uuid not null references proformas(id) on delete cascade,
  line_no int not null,

  product_id uuid references products(id),
  product_sku text not null,
  product_name text not null,
  product_lot_id uuid references product_lots(id),
  lot_number text,

  kind text not null default 'bien'
    check (kind in ('bien','servicio')),
  quantity numeric(14,2) not null,
  unit_price numeric(14,4) not null,
  itbis_rate numeric(5,2) not null default 0,
  discount numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null,
  itbis numeric(14,2) not null default 0,
  total numeric(14,2) not null,

  -- Indicador de facturación según codificación DGII. Valores exactos
  -- pendientes de validar contra documentación oficial.
  indicador_facturacion text,

  created_at timestamptz not null default now(),
  unique (proforma_id, line_no)
);
alter table proforma_items enable row level security;
create policy proforma_items_all on proforma_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Pagos de proformas ─────────────────────────────────────────────────────

create table if not exists proforma_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  proforma_id uuid not null references proformas(id) on delete cascade,

  payment_method_id uuid references payment_methods(id),
  method_code text not null
    check (method_code in (
      'cash','card','transfer','azul','cardnet','visanet','paypal','manual','other'
    )),
  amount numeric(14,2) not null check (amount > 0),
  reference text,

  user_id uuid not null references users(id),
  user_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists proforma_payments_proforma_idx
  on proforma_payments(business_id, proforma_id);
alter table proforma_payments enable row level security;
create policy proforma_payments_all on proforma_payments for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Cierres de caja ───────────────────────────────────────────────────────

create table if not exists cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  cash_register_session_id uuid not null
    references cash_register_sessions(id) on delete cascade,

  closing_by uuid not null references users(id),
  closing_by_name text not null,
  closing_at timestamptz not null default now(),

  total_cash numeric(14,2) not null default 0,
  total_transfer numeric(14,2) not null default 0,
  total_card numeric(14,2) not null default 0,
  total_other numeric(14,2) not null default 0,
  total_general numeric(14,2) not null default 0,

  total_proformas_pending numeric(14,2) not null default 0,
  count_proformas_pending int not null default 0,

  applied_percentage numeric(5,2) not null default 0
    check (applied_percentage between 0 and 100),
  target_amount_to_ecf numeric(14,2) not null default 0,
  actual_amount_to_ecf numeric(14,2) not null default 0,
  count_proformas_converted int not null default 0,
  count_proformas_left_pending int not null default 0,

  authorizer_user_id uuid references users(id),
  authorizer_name text,
  comment text,

  status text not null default 'pending'
    check (status in ('pending','confirmed','reverted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cash_closings_business_idx
  on cash_closings(business_id, closing_at desc);
create index if not exists cash_closings_session_idx
  on cash_closings(business_id, cash_register_session_id);
alter table cash_closings enable row level security;
create policy cash_closings_all on cash_closings for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists cash_closing_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  cash_closing_id uuid not null references cash_closings(id) on delete cascade,
  proforma_id uuid not null references proformas(id) on delete cascade,
  selected_for_ecf boolean not null default false,
  converted_to_ecf_at timestamptz,
  electronic_invoice_id uuid,
  selection_method text not null default 'manual'
    check (selection_method in ('manual','fifo','largest','smallest')),
  created_at timestamptz not null default now(),
  unique (cash_closing_id, proforma_id)
);
create index if not exists cash_closing_sales_closing_idx
  on cash_closing_sales(business_id, cash_closing_id);
alter table cash_closing_sales enable row level security;
create policy cash_closing_sales_all on cash_closing_sales for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Auditoría detallada del campo porcentaje (immutable).
create table if not exists cash_closing_percentage_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  cash_closing_id uuid not null references cash_closings(id) on delete cascade,

  entered_by uuid not null references users(id),
  entered_by_name text not null,
  entered_at timestamptz not null default now(),
  percentage_entered numeric(5,2) not null
    check (percentage_entered between 0 and 100),

  total_proformas_available numeric(14,2) not null,
  target_amount_calculated numeric(14,2) not null,
  actual_amount_converted numeric(14,2) not null,
  count_converted int not null,
  count_left_pending int not null,

  comment text,
  authorizer_user_id uuid references users(id),
  authorizer_name text,
  final_status text not null
    check (final_status in ('confirmed','rejected','reverted'))
);
create index if not exists cash_closing_percentage_logs_closing_idx
  on cash_closing_percentage_logs(business_id, cash_closing_id, entered_at desc);
alter table cash_closing_percentage_logs enable row level security;
create policy cash_closing_percentage_logs_all on cash_closing_percentage_logs for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Trazabilidad proforma → e-CF (immutable).
create table if not exists proforma_to_ecf_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  proforma_id uuid not null references proformas(id) on delete cascade,
  electronic_invoice_id uuid not null,
  triggered_by uuid not null references users(id),
  triggered_by_name text not null,
  cash_closing_id uuid references cash_closings(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists proforma_to_ecf_logs_proforma_idx
  on proforma_to_ecf_logs(business_id, proforma_id);
alter table proforma_to_ecf_logs enable row level security;
create policy proforma_to_ecf_logs_all on proforma_to_ecf_logs for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── e-CF (electronic_invoices) ─────────────────────────────────────────────

create table if not exists electronic_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,

  proforma_id uuid references proformas(id) on delete set null,
  source_invoice_id uuid,  -- para NC/ND (e-CF 34/33), referencia al original

  tipo_ecf text not null
    check (tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')),
  e_ncf text not null,
  secuencia_id uuid references ecf_sequences(id),

  status text not null default 'draft'
    check (status in (
      'draft','generated','validated','signed','submitted',
      'in_process','accepted','accepted_conditional','rejected',
      'cancelled','error','voided'
    )),

  customer_id uuid references clients(id),
  customer_name text,
  customer_rnc text,

  subtotal_gravado numeric(14,2) not null default 0,
  subtotal_exento numeric(14,2) not null default 0,
  total_itbis numeric(14,2) not null default 0,
  total_otros_impuestos numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  currency text not null default 'DOP',

  -- Artefactos del flujo DGII. Path a Storage privado, nunca el contenido en
  -- texto en producción (PII fiscal).
  xml_generated_path text,
  xml_signed_path text,
  xml_response_path text,
  pdf_path text,
  qr_code_payload text,
  security_code text,
  hash_sha256 text,

  -- Estado DGII
  track_id text,
  dgii_status_code text,
  dgii_status_message text,
  ambiente text not null
    check (ambiente in ('testecf','certecf','ecf')),

  generated_at timestamptz,
  signed_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,

  generated_by uuid references users(id),
  sent_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (business_id, e_ncf, ambiente)
);
create index if not exists electronic_invoices_business_status_idx
  on electronic_invoices(business_id, status, created_at desc);
create index if not exists electronic_invoices_business_track_idx
  on electronic_invoices(business_id, track_id) where track_id is not null;
create index if not exists electronic_invoices_proforma_idx
  on electronic_invoices(business_id, proforma_id);
alter table electronic_invoices enable row level security;
create policy electronic_invoices_all on electronic_invoices for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- Backfills opcionales para FKs circulares (proformas.electronic_invoice_id,
-- cash_closing_sales.electronic_invoice_id, proforma_to_ecf_logs.electronic_invoice_id).
alter table proformas
  add constraint proformas_electronic_invoice_fk
    foreign key (electronic_invoice_id) references electronic_invoices(id)
    on delete set null
    deferrable initially deferred;
alter table cash_closing_sales
  add constraint cash_closing_sales_electronic_invoice_fk
    foreign key (electronic_invoice_id) references electronic_invoices(id)
    on delete set null
    deferrable initially deferred;
alter table proforma_to_ecf_logs
  add constraint proforma_to_ecf_logs_electronic_invoice_fk
    foreign key (electronic_invoice_id) references electronic_invoices(id)
    on delete set null
    deferrable initially deferred;

create table if not exists electronic_invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  electronic_invoice_id uuid not null
    references electronic_invoices(id) on delete cascade,
  line_no int not null,

  -- Snapshot inmutable al momento de generar el XML.
  product_id uuid references products(id) on delete set null,
  product_sku text,
  name_item text not null,
  description_item text,
  kind text not null default 'bien'
    check (kind in ('bien','servicio')),
  quantity numeric(14,2) not null,
  unit_measure text,
  unit_price numeric(14,4) not null,
  discount_amount numeric(14,2) not null default 0,
  itbis_rate numeric(5,2) not null default 0,
  indicador_facturacion text,
  monto_item numeric(14,2) not null,

  created_at timestamptz not null default now(),
  unique (electronic_invoice_id, line_no)
);
alter table electronic_invoice_items enable row level security;
create policy electronic_invoice_items_all on electronic_invoice_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── Envíos y consultas DGII (immutables) ───────────────────────────────────

create table if not exists dgii_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  electronic_invoice_id uuid not null
    references electronic_invoices(id) on delete cascade,

  attempt_no int not null default 1,
  endpoint_url text not null,
  request_headers jsonb,
  request_body_path text,
  response_status int,
  response_body_path text,
  track_id text,
  error_code text,
  error_message text,

  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (electronic_invoice_id, attempt_no)
);
create index if not exists dgii_submissions_invoice_idx
  on dgii_submissions(business_id, electronic_invoice_id, sent_at desc);
alter table dgii_submissions enable row level security;
create policy dgii_submissions_all on dgii_submissions for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists dgii_status_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  electronic_invoice_id uuid not null
    references electronic_invoices(id) on delete cascade,
  track_id text not null,

  response_status int,
  response_code text,
  response_message text,
  response_body_path text,

  consulted_at timestamptz not null default now()
);
create index if not exists dgii_status_logs_invoice_idx
  on dgii_status_logs(business_id, electronic_invoice_id, consulted_at desc);
create index if not exists dgii_status_logs_track_idx
  on dgii_status_logs(business_id, track_id);
alter table dgii_status_logs enable row level security;
create policy dgii_status_logs_all on dgii_status_logs for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ─── e-CF recibidos + Aprobación Comercial ──────────────────────────────────

create table if not exists dgii_received_ecf (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,

  tipo_ecf text not null
    check (tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')),
  e_ncf text not null,
  rnc_emisor_sender text not null,
  razon_social_emisor text,
  xml_path text not null,
  total numeric(14,2) not null default 0,

  received_at timestamptz not null default now(),
  processed_at timestamptz,
  commercial_approval_status text not null default 'pending'
    check (commercial_approval_status in (
      'pending','approved','conditionally_approved','rejected','total_rejection'
    )),

  unique (business_id, e_ncf, rnc_emisor_sender)
);
create index if not exists dgii_received_ecf_business_idx
  on dgii_received_ecf(business_id, received_at desc);
alter table dgii_received_ecf enable row level security;
create policy dgii_received_ecf_all on dgii_received_ecf for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create table if not exists dgii_commercial_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  received_ecf_id uuid not null
    references dgii_received_ecf(id) on delete cascade,

  decision text not null
    check (decision in ('approved','conditionally_approved','rejected','total_rejection')),
  decided_by uuid not null references users(id),
  decided_by_name text not null,
  decided_at timestamptz not null default now(),
  reason text,
  xml_path text,

  -- Estado de envío de la respuesta al emisor (cuando aplique)
  response_sent_at timestamptz,
  response_track_id text
);
create index if not exists dgii_commercial_approvals_business_idx
  on dgii_commercial_approvals(business_id, decided_at desc);
alter table dgii_commercial_approvals enable row level security;
create policy dgii_commercial_approvals_all on dgii_commercial_approvals for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- =============================================================================
-- Notas finales
-- =============================================================================
-- 1. NO se hacen INSERT de datos reales en este archivo. Los seeds (permisos
--    DGII, formas de pago default, etc.) van en una migración aparte sobre
--    autorización del usuario.
-- 2. NO se cambia `businesses.dgii_enabled`. La activación real requiere
--    certificado válido + secuencias importadas + visto bueno administrativo.
-- 3. Las funciones `auth_business_id()` y `auth_is_platform_admin()` se
--    asumen creadas en 0001_phase1_core.sql; esta migración depende de ellas.
-- 4. FKs circulares (proforma ↔ electronic_invoice) se declaran como
--    DEFERRABLE INITIALLY DEFERRED para permitir crear ambos registros en
--    la misma transacción.
-- 5. Mapeo TS ↔ SQL: pendiente `apps/web/src/server/repositories/supabase/mappers.ts`
--    cuando se implemente la capa Supabase para repositorios DGII.
-- =============================================================================
