-- supabase/migrations/20260906090100_dgii_fase2_tablas.sql
--
-- DGII fase 2, parte 2 de 3: las 17 tablas del módulo fiscal de agendapp.
--
-- Portadas de ~/Projects/agendapp/prisma/migrations/applied/ (commit 8dbda0f6),
-- con seis sustituciones y ninguna más: `current_user_business_id()` ->
-- `auth_business_id()`, `sales` -> `proformas`, esquema cualificado, search_path
-- de esta casa, minúsculas, y comentarios reescritos.
--
-- Requiere la parte 1 aplicada: siete de estos nombres los ocupaba el módulo
-- viejo.
--
-- Material sensible: `dgii_certificates.pkcs12_encrypted_blob` y
-- `.password_secret_ref` son sobres AES-256-GCM. NUNCA texto plano. El XML y las
-- respuestas de la DGII se guardan como RUTAS a un bucket privado, no como
-- contenido en columnas de log. `dgii_submissions.request_headers` no puede
-- llevar Authorization ni token.
--
-- Nota de portado (detalle completo en task-3-report.md y docs/decisiones.md):
-- * `sales` no aparece dentro de ninguna de estas 17 tablas (solo aparecía en
--   la sección de `ALTER TABLE sales ...` del fichero fuente, fuera de alcance
--   de esta tarea), así que la sustitución sales -> proformas no tiene ninguna
--   ocurrencia real que aplicar aquí.
-- * `ecf_sequences_next_dentro_del_rango` NO es una adición: es el mismo CHECK
--   que agendapp ya trae como `ecf_sequences_next_chk`
--   (20260609_dgii_phase2_core_tables.sql:94, idéntico carácter por carácter
--   salvo mayúsculas), solo que aquí se renombró para que el nombre diga en
--   español lo que la restricción hace. El CHECK de rango
--   (`ecf_sequences_range_chk`) y el UNIQUE (`ecf_sequences_uniq`) se
--   conservaron con sus nombres originales de la fuente. No hay ninguna
--   adición neta sobre el DDL de origen en ninguna de las 17 tablas (el plan
--   de la fase decía lo contrario; esa afirmación del plan era incorrecta y
--   se corrigió — ver docs/decisiones.md, entrada 2026-09-05).
-- * `dgii_certification_events.source` y `dgii_certification_evidence.source`
--   conservan el valor `'agendapp-system'` tal cual viene de la fuente: no es
--   ninguna de las seis sustituciones, así que no se ha tocado.

-- ── 1) dgii_settings ─────────────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:41-55 (1:1 con
-- business; la PK es el propio business_id).
create table if not exists public.dgii_settings (
  business_id            uuid primary key references public.businesses(id) on delete cascade,
  rnc_emisor             varchar(11),
  razon_social_emisor    text,
  direccion_emisor       text,
  provincia_codigo       varchar(10),
  municipio_codigo       varchar(10),
  correo_emisor          text,
  telefono_emisor        varchar(40),
  ambiente               text not null default 'testecf'
                           check (ambiente in ('testecf','certecf','ecf')),
  dgii_enabled_real_send boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.dgii_settings enable row level security;
drop policy if exists dgii_settings_all on public.dgii_settings;
create policy dgii_settings_all on public.dgii_settings for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 2) dgii_certificates ─────────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:58-76 (tabla) y
-- líneas 201, 203-204 (índices, agrupados aparte en la fuente).
-- Material sensible: pkcs12_encrypted_blob y password_secret_ref son sobres
-- sellados AES-256-GCM. NUNCA texto plano de clave ni llave privada.
create table if not exists public.dgii_certificates (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  alias                 text,
  subject_dn            text,
  issuer_dn             text,
  serial_number         varchar(128),
  valid_from            timestamptz,
  valid_to              timestamptz,
  storage_bucket        text,
  storage_path          text,
  pkcs12_encrypted_blob bytea,   -- sobre sellado AES-256-GCM; NUNCA texto plano
  password_secret_ref   text,    -- sobre sellado AES-256-GCM; NUNCA texto plano
  kdf                   text default 'AES-256-GCM',
  is_active             boolean not null default false,
  uploaded_by           uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  revoked_at            timestamptz
);
create index if not exists idx_dgii_certificates_business
  on public.dgii_certificates (business_id);
-- Un solo certificado ACTIVO por business (índice único parcial):
create unique index if not exists uniq_dgii_cert_active_per_business
  on public.dgii_certificates (business_id) where is_active;

alter table public.dgii_certificates enable row level security;
drop policy if exists dgii_certificates_all on public.dgii_certificates;
create policy dgii_certificates_all on public.dgii_certificates for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 3) ecf_sequences ─────────────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:79-96 (tabla) y
-- líneas 206-207 (índice). `ecf_sequences_next_dentro_del_rango` es un
-- renombre de `ecf_sequences_next_chk` de la fuente, no una adición (ver nota
-- de portado, arriba).
create table if not exists public.ecf_sequences (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  tipo_ecf    text not null
                check (tipo_ecf in ('31','32','33','34','41','42','43','44','45','46','47')),
  ambiente    text not null check (ambiente in ('testecf','certecf','ecf')),
  range_start bigint not null,
  range_end   bigint not null,
  next_number bigint not null,
  expires_at  timestamptz,
  status      text not null default 'active'
                check (status in ('active','exhausted','expired','revoked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ecf_sequences_range_chk check (range_start <= range_end),
  constraint ecf_sequences_next_dentro_del_rango
    check (next_number >= range_start and next_number <= range_end + 1),
  constraint ecf_sequences_uniq unique (business_id, tipo_ecf, ambiente, range_start)
);
create index if not exists idx_ecf_sequences_lookup
  on public.ecf_sequences (business_id, tipo_ecf, ambiente, status);

alter table public.ecf_sequences enable row level security;
drop policy if exists ecf_sequences_all on public.ecf_sequences;
create policy ecf_sequences_all on public.ecf_sequences for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 4) electronic_invoices ───────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:99-129 (tabla) y
-- líneas 209-212 (índices).
create table if not exists public.electronic_invoices (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  tipo_ecf            text not null
                        check (tipo_ecf in ('31','32','33','34','41','42','43','44','45','46','47')),
  e_ncf               varchar(13) not null check (e_ncf ~ '^[A-Z][0-9]{12}$'),
  secuencia_id        uuid references public.ecf_sequences(id) on delete set null,
  -- Los 12 estados de la máquina de la fase 1, en su orden
  -- (`features/dgii/core/submission-state-types.ts`). `prepared` NO viene de
  -- agendapp: lo añadió la fase 1 y dejó el recado por escrito para esta. Es el
  -- único camino no terminal que sale de `signed`
  -- (`submission-state-machine.ts:17-18`), así que sin él una factura firmada
  -- se queda clavada con su e-NCF ya consumido.
  status              text not null default 'draft'
                        check (status in ('draft','generated','validated','signed','prepared',
                               'submitted','in_process','accepted','accepted_conditional',
                               'rejected','cancelled','error')),
  ambiente            text not null check (ambiente in ('testecf','certecf','ecf')),
  customer_id         uuid references public.clients(id) on delete set null,
  customer_rnc        varchar(11),
  subtotal_gravado    numeric(14,2) not null default 0 check (subtotal_gravado >= 0),
  total_itbis         numeric(14,2) not null default 0 check (total_itbis >= 0),
  total               numeric(14,2) not null default 0 check (total >= 0),
  xml_generated_path  text,
  xml_signed_path     text,
  xml_response_path   text,
  track_id            text,
  dgii_status_code    text,
  dgii_status_message text,
  generated_at        timestamptz,
  signed_at           timestamptz,
  sent_at             timestamptz,
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint electronic_invoices_encf_uniq unique (business_id, ambiente, e_ncf)
);
create index if not exists idx_einv_business_status   on public.electronic_invoices (business_id, status);
create index if not exists idx_einv_business_ambiente on public.electronic_invoices (business_id, ambiente);
create index if not exists idx_einv_track_id          on public.electronic_invoices (track_id);
create index if not exists idx_einv_business_encf     on public.electronic_invoices (business_id, e_ncf);

alter table public.electronic_invoices enable row level security;
drop policy if exists electronic_invoices_all on public.electronic_invoices;
create policy electronic_invoices_all on public.electronic_invoices for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 5) electronic_invoice_items ──────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:132-143 (tabla) y
-- líneas 214-215 (índices). Snapshot inmutable de las líneas al generar el XML.
create table if not exists public.electronic_invoice_items (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  electronic_invoice_id uuid not null references public.electronic_invoices(id) on delete cascade,
  line_no               int  not null,
  name_item             varchar(255) not null,
  quantity              numeric(12,3) not null default 1 check (quantity >= 0),
  unit_price            numeric(14,2) not null check (unit_price >= 0),
  itbis_rate            numeric(5,4)  not null default 0 check (itbis_rate >= 0),
  monto_item            numeric(14,2) not null check (monto_item >= 0),
  created_at            timestamptz not null default now()
);
create index if not exists idx_einv_items_invoice  on public.electronic_invoice_items (electronic_invoice_id);
create index if not exists idx_einv_items_business on public.electronic_invoice_items (business_id);

alter table public.electronic_invoice_items enable row level security;
drop policy if exists electronic_invoice_items_all on public.electronic_invoice_items;
create policy electronic_invoice_items_all on public.electronic_invoice_items for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 6) dgii_submissions ──────────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:146-162 (tabla) y
-- líneas 217-218 (índices). Un registro por CADA intento de envío a la DGII.
create table if not exists public.dgii_submissions (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  electronic_invoice_id uuid not null references public.electronic_invoices(id) on delete cascade,
  attempt_no            int  not null default 1,
  endpoint_url          text,
  request_headers       jsonb,   -- redactado: NUNCA Authorization ni token
  request_body_path     text,    -- ruta a Storage, no inline
  response_status       int,
  response_body_path    text,
  track_id              text,
  error_code            text,
  error_message         text,
  sent_at               timestamptz,
  responded_at          timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_dgii_sub_business_invoice
  on public.dgii_submissions (business_id, electronic_invoice_id);
create index if not exists idx_dgii_sub_track_id
  on public.dgii_submissions (track_id);

alter table public.dgii_submissions enable row level security;
drop policy if exists dgii_submissions_all on public.dgii_submissions;
create policy dgii_submissions_all on public.dgii_submissions for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 7) dgii_status_logs ──────────────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:165-174 (tabla) y
-- líneas 220-221 (índices). Un registro por cada consulta de TrackId.
create table if not exists public.dgii_status_logs (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  electronic_invoice_id uuid not null references public.electronic_invoices(id) on delete cascade,
  track_id              text,
  status_code           text,
  status_message        text,
  raw_response_path     text,
  checked_at            timestamptz not null default now()
);
create index if not exists idx_dgii_status_business_checked
  on public.dgii_status_logs (business_id, checked_at desc);
create index if not exists idx_dgii_status_invoice
  on public.dgii_status_logs (electronic_invoice_id);

alter table public.dgii_status_logs enable row level security;
drop policy if exists dgii_status_logs_all on public.dgii_status_logs;
create policy dgii_status_logs_all on public.dgii_status_logs for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 8) dgii_enablement_progress ──────────────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:177-185 (1:1 con
-- business; sin índices propios en la fuente).
create table if not exists public.dgii_enablement_progress (
  business_id          uuid primary key references public.businesses(id) on delete cascade,
  step                 int not null default 1,
  step_status          text,
  evidence             jsonb,
  declaration_accepted boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.dgii_enablement_progress enable row level security;
drop policy if exists dgii_enablement_progress_all on public.dgii_enablement_progress;
create policy dgii_enablement_progress_all on public.dgii_enablement_progress for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 9) dgii_representative_attestations ──────────────────────────────────────
-- Portada de agendapp: 20260609_dgii_phase2_core_tables.sql:188-198 (tabla) y
-- línea 223 (índice). Snapshot de evidencias del representante.
create table if not exists public.dgii_representative_attestations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_key    varchar(64) not null,
  item_status text,
  responsable text,
  attested_at timestamptz,
  doc_ref     text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_dgii_attest_business
  on public.dgii_representative_attestations (business_id);

alter table public.dgii_representative_attestations enable row level security;
drop policy if exists dgii_representative_attestations_all on public.dgii_representative_attestations;
create policy dgii_representative_attestations_all on public.dgii_representative_attestations for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 10) received_ecf ─────────────────────────────────────────────────────────
-- Portada de agendapp: 20260707_dgii_b2b_received_ecf.sql:26-59 (tabla) y
-- líneas 62-67 (índices). e-CF ENTRANTES de otros emisores (no confundir con
-- electronic_invoices, que son los que emitimos nosotros).
create table if not exists public.received_ecf (
  id                     uuid        primary key default gen_random_uuid(),
  business_id            uuid        not null references public.businesses(id) on delete cascade,
  rnc_emisor             text        not null, -- RNC del emisor remoto (quien nos factura)
  rnc_comprador          text        not null, -- RNC nuestro (verificado contra dgii_settings.rnc_emisor)
  encf                   text        not null,
  tipo_ecf               text        not null, -- derivado del eNCF (posiciones 2-3)
  razon_social_emisor    text,
  fecha_emision          text,                 -- tal como viene en el XML (dd-MM-yyyy); sin normalizar
  monto_total            numeric(14,2),
  xml_storage_path       text        not null, -- bucket privado, NUNCA contenido inline
  xml_sha256             text        not null,
  signature_present      boolean     not null default false,
  -- Semántica de firma remota: criptográficamente válida NO es lo mismo que confiable.
  signature_cryptographic_valid boolean,   -- la firma verifica con el X509 embebido (integridad)
  certificate_trusted    boolean     not null default false, -- fail-closed hasta trust-store aprobado
  certificate_time_valid boolean,          -- vigencia del certificado embebido al recibir
  revocation_status      text        not null default 'unknown'
                         check (revocation_status in ('unknown','good','revoked')),
  issuer_identity_match  boolean,           -- heurística RNCEmisor en subject; null = no determinable
  signature_cert_fingerprint text,         -- fingerprint del certificado embebido (referencia)
  xsd_valid              boolean     not null default false,
  status                 text        not null default 'received'
                         check (status in ('received','acknowledged','accepted','rejected','invalid')),
  arecf_estado           int,                  -- 0=recibido, 1=no recibido (acuse SIEMPRE firmado)
  arecf_storage_path     text,                 -- ARECF firmado que respondimos
  acecf_estado           int,                  -- 1=aceptado, 2=rechazado (decisión comercial)
  acecf_storage_path     text,
  rejection_reason       text,                 -- DetalleMotivoRechazo (<=250, regla ACECF)
  audit_ref              uuid,                 -- correlación con audit_logs
  received_at            timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists received_ecf_business_emisor_encf_key
  on public.received_ecf (business_id, rnc_emisor, encf);
create index if not exists received_ecf_business_status_idx
  on public.received_ecf (business_id, status);
create index if not exists received_ecf_business_received_at_idx
  on public.received_ecf (business_id, received_at desc);

alter table public.received_ecf enable row level security;
drop policy if exists received_ecf_all on public.received_ecf;
create policy received_ecf_all on public.received_ecf for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 11) received_commercial_approvals ────────────────────────────────────────
-- Portada de agendapp: 20260709_dgii_received_commercial_approvals.sql:29-54
-- (tabla) y líneas 57-64 (índices). Respuestas comerciales (ACECF) de nuestros
-- compradores a los e-CF que NOSOTROS emitimos (relación con electronic_invoices,
-- modelo separado a propósito de received_ecf).
create table if not exists public.received_commercial_approvals (
  id                     uuid        primary key default gen_random_uuid(),
  business_id            uuid        not null references public.businesses(id) on delete cascade,
  -- e-CF emitido al que responde (null si el eNCF no coincide con uno emitido
  -- nuestro; la capa de servicio rechaza ese caso, pero el modelo no lo impide).
  electronic_invoice_id  uuid        references public.electronic_invoices(id) on delete set null,
  encf                   text        not null, -- eNCF de NUESTRO e-CF
  rnc_emisor             text        not null, -- del XML; debe ser el rnc_emisor del tenant
  rnc_comprador          text        not null, -- quién aprueba/rechaza
  estado                 int         not null check (estado in (1, 2)), -- 1=Aceptado · 2=Rechazado
  detalle_motivo_rechazo text        check (char_length(detalle_motivo_rechazo) <= 250),
  fecha_emision          text,                 -- dd-MM-AAAA tal como viene (fiel, sin normalizar)
  monto_total            numeric(14,2),
  fecha_hora_aprobacion  text,                 -- dd-MM-AAAA HH:mm:ss del XML (fiel)
  xml_storage_path       text        not null, -- bucket privado, NUNCA contenido inline
  xml_sha256             text        not null,
  signature_present      boolean     not null default false,
  -- misma semántica que received_ecf: integridad (verifica con el X509 embebido) no es confianza.
  signature_cryptographic_valid boolean,
  certificate_trusted    boolean     not null default false, -- fail-closed hasta evaluar trust
  audit_ref              uuid,
  received_at            timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists received_ca_business_encf_comprador_sha_key
  on public.received_commercial_approvals (business_id, encf, rnc_comprador, xml_sha256);
create index if not exists received_ca_business_received_at_idx
  on public.received_commercial_approvals (business_id, received_at desc);
create index if not exists received_ca_business_encf_idx
  on public.received_commercial_approvals (business_id, encf);
create index if not exists received_ca_invoice_idx
  on public.received_commercial_approvals (electronic_invoice_id);

alter table public.received_commercial_approvals enable row level security;
drop policy if exists received_commercial_approvals_all on public.received_commercial_approvals;
create policy received_commercial_approvals_all on public.received_commercial_approvals for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 12) dgii_certification_datasets ──────────────────────────────────────────
-- Portada de agendapp: 20260716_dgii_certification_dataset.sql:31-49 (tabla) y
-- líneas 52-55 (índices). Cabecera: un registro por (tenant, ambiente, hash del
-- libro de casos de certificación cargado).
create table if not exists public.dgii_certification_datasets (
  id              uuid        primary key default gen_random_uuid(),
  business_id     uuid        not null references public.businesses(id) on delete cascade,
  environment     text        not null default 'testecf'
                              check (environment in ('testecf','certecf','ecf')),
  source_filename text,                              -- nombre original del .xlsx (referencia)
  dataset_sha256  text        not null,              -- SHA-256 del workbook (integridad/dedupe)
  rnc_emisor      text        not null,              -- RNC del set
  total_cases     int         not null default 0,    -- total de casos del set
  ecf_count       int         not null default 0,
  rfce_count      int         not null default 0,
  distribution    jsonb,                             -- distribución por tipo, verificada al cargar
  status          text        not null default 'loaded'
                              check (status in ('loaded','prepared','partially_sent','completed')),
  prepared_at     timestamptz,                       -- cuando todos los dry-runs quedaron verdes
  created_by      uuid,                              -- usuario que cargó (audit)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists dgii_certification_datasets_biz_env_hash_key
  on public.dgii_certification_datasets (business_id, environment, dataset_sha256);
create index if not exists dgii_certification_datasets_biz_env_idx
  on public.dgii_certification_datasets (business_id, environment);

alter table public.dgii_certification_datasets enable row level security;
drop policy if exists dgii_certification_datasets_all on public.dgii_certification_datasets;
create policy dgii_certification_datasets_all on public.dgii_certification_datasets for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 13) dgii_certification_cases ─────────────────────────────────────────────
-- Portada de agendapp: 20260716_dgii_certification_dataset.sql:65-89 (tabla) y
-- líneas 92-99 (índices). Detalle: un caso por set, e-NCF exacto e inmutable.
create table if not exists public.dgii_certification_cases (
  id              uuid        primary key default gen_random_uuid(),
  dataset_id      uuid        not null references public.dgii_certification_datasets(id) on delete cascade,
  business_id     uuid        not null references public.businesses(id) on delete cascade, -- denormalizado para RLS
  environment     text        not null default 'testecf'
                              check (environment in ('testecf','certecf','ecf')),
  case_id         text        not null,              -- identificador del caso en el set
  kind            text        not null check (kind in ('ecf','rfce')),
  -- tipo enumerado 31-47 SIN 42 (fail-closed): 42 no es un e-CF válido.
  tipo            text        not null
                              check (tipo in ('31','32','33','34','41','43','44','45','46','47')),
  exact_e_ncf     text        not null,              -- e-NCF exacto del set (reservado, jamás por allocator)
  sequence_index  int,                               -- orden sugerido en el runner
  arithmetic_ok   boolean,                           -- validación aritmética cabecera vs. líneas
  xsd_ok          boolean,                           -- XML firmado valida su XSD oficial
  signature_ok    boolean,                           -- firma XMLDSig verifica
  xml_sha256      text,                              -- hash del XML firmado del dry-run
  security_code   text,                              -- código de seguridad (6 chars) del firmado
  status          text        not null default 'pending'
                              check (status in ('pending','prepared','sent','accepted','rejected')),
  track_id        text,                              -- trackId DGII
  result          jsonb,                             -- respuesta/estado detallado
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists dgii_certification_cases_dataset_caseid_key
  on public.dgii_certification_cases (dataset_id, case_id);
create unique index if not exists dgii_certification_cases_biz_env_dataset_encf_key
  on public.dgii_certification_cases (business_id, environment, dataset_id, exact_e_ncf);
create index if not exists dgii_certification_cases_dataset_idx
  on public.dgii_certification_cases (dataset_id);
create index if not exists dgii_certification_cases_biz_status_idx
  on public.dgii_certification_cases (business_id, status);

alter table public.dgii_certification_cases enable row level security;
drop policy if exists dgii_certification_cases_all on public.dgii_certification_cases;
create policy dgii_certification_cases_all on public.dgii_certification_cases for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 14) dgii_simulation_ranges ───────────────────────────────────────────────
-- Portada de agendapp: 20260723_dgii_simulation_ranges.sql:30-63 (tabla) y
-- líneas 66-71 (índices). Rangos de e-NCF de la corrida de SIMULACIÓN, siempre
-- separados de `ecf_sequences` (comerciales): nunca usa el allocator productivo.
create table if not exists public.dgii_simulation_ranges (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  -- Discriminador de etapa: siempre 'simulacion' (espeja el `purpose` de la corrida).
  purpose        text not null default 'simulacion'
                   check (purpose = 'simulacion'),
  -- La simulación corre en el ambiente de certificación CerteCF; jamás en producción ('ecf').
  environment    text not null default 'certecf'
                   check (environment in ('testecf','certecf')),
  -- Tipo e-CF en alcance (31-47 sin 42, fail-closed).
  tipo           text not null
                   check (tipo in ('31','32','33','34','41','43','44','45','46','47')),
  -- Rango [desde..hasta] (enteros positivos, desde <= hasta).
  desde          integer not null check (desde > 0),
  hasta          integer not null check (hasta >= desde),
  -- Próxima secuencia a asignar dentro del rango (nunca retrocede; desde <= next <= hasta+1).
  next           integer not null,
  -- Vigencia informada por la DGII (dd-MM-yyyy): inicio y expiración opcional.
  vigencia_desde text,
  vigencia_hasta text,
  estado         text not null default 'active'
                   check (estado in ('active','exhausted','revoked')),
  -- Origen del rango (evidencia de que lo entregó la DGII; jamás inventado).
  origen         text not null default 'dgii_portal'
                   check (origen in ('dgii_portal','dgii_excel')),
  evidencia      text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dgii_simulation_ranges_next_within check (next >= desde and next <= hasta + 1)
);
create unique index if not exists dgii_simulation_ranges_biz_env_tipo_desde_key
  on public.dgii_simulation_ranges (business_id, environment, tipo, desde);
create index if not exists dgii_simulation_ranges_biz_env_tipo_idx
  on public.dgii_simulation_ranges (business_id, environment, tipo);
create index if not exists dgii_simulation_ranges_biz_estado_idx
  on public.dgii_simulation_ranges (business_id, estado);

alter table public.dgii_simulation_ranges enable row level security;
drop policy if exists dgii_simulation_ranges_all on public.dgii_simulation_ranges;
create policy dgii_simulation_ranges_all on public.dgii_simulation_ranges for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 15) dgii_certification_applications ──────────────────────────────────────
-- Portada de agendapp: 20260727_dgii_certification_workflow.sql:36-61 (tabla) y
-- líneas 64-69 (índices). LA postulación: snapshot derivado de los eventos, con
-- versionado optimista (`version`), nunca editado a mano.
create table if not exists public.dgii_certification_applications (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  -- identidad fiscal con la que se postula
  fiscal_identity_slug  text,
  application_type      varchar(30) not null default 'ecf_certification'
    check (application_type in ('ecf_certification')),
  software_name         varchar(160),
  software_version      varchar(40),
  environment           varchar(20) not null default 'certecf'
    check (environment in ('testecf','certecf','ecf')),
  -- Snapshot derivado de los eventos (nunca se edita a mano; lo escribe el reconciliador con CAS).
  current_step          smallint not null default 1 check (current_step between 1 and 15),
  current_status        varchar(40) not null default 'available'
    check (current_status in (
      'locked','available','in_progress','pending_owner_action','pending_dgii_review',
      'rejected','correction_required','resubmitted','approved','completed'
    )),
  lifecycle             varchar(20) not null default 'active'
    check (lifecycle in ('active','completed','abandoned')),
  version               integer not null default 0,
  started_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,
  created_by_user_id    uuid
);

-- Una sola postulación ACTIVA por negocio (las históricas quedan con lifecycle <> 'active').
create unique index if not exists dgii_cert_app_one_active_per_business
  on public.dgii_certification_applications (business_id)
  where lifecycle = 'active';
create index if not exists dgii_cert_app_business_idx
  on public.dgii_certification_applications (business_id, started_at desc);

alter table public.dgii_certification_applications enable row level security;
drop policy if exists dgii_certification_applications_all on public.dgii_certification_applications;
create policy dgii_certification_applications_all on public.dgii_certification_applications for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 16) dgii_certification_events ────────────────────────────────────────────
-- Portada de agendapp: 20260727_dgii_certification_workflow.sql:79-98 (tabla) y
-- líneas 101-108 (índices). Log APPEND-ONLY tipado por paso (1-15).
create table if not exists public.dgii_certification_events (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null references public.dgii_certification_applications(id) on delete cascade,
  business_id        uuid not null references public.businesses(id) on delete cascade,
  step_number        smallint not null check (step_number between 1 and 15),
  event_type         varchar(60) not null,
  previous_status    varchar(40),
  resulting_status   varchar(40) not null,
  -- quién/qué originó el hecho. 'legacy-audit-log' queda reservado para el
  -- adaptador de lectura de audit_logs (nunca escribe, solo proyecta).
  source             varchar(40) not null default 'portal-dgii-official'
    check (source in ('portal-dgii-official','owner-manual','agendapp-system','legacy-audit-log')),
  actor_user_id      uuid,
  evidence_id        uuid,
  idempotency_key    text not null,
  metadata           jsonb not null default '{}'::jsonb,  -- sanitizada (sin secretos ni PII innecesaria)
  occurred_at        timestamptz not null default now(),  -- cuándo ocurrió el hecho (puede ser pasado)
  created_at         timestamptz not null default now()   -- cuándo se registró
);

-- Idempotencia real: repetir la misma operación no duplica el evento.
create unique index if not exists dgii_cert_event_idempotency_uq
  on public.dgii_certification_events (business_id, idempotency_key);
create index if not exists dgii_cert_event_app_order_idx
  on public.dgii_certification_events (application_id, occurred_at, created_at);
create index if not exists dgii_cert_event_step_idx
  on public.dgii_certification_events (application_id, step_number, occurred_at desc);

alter table public.dgii_certification_events enable row level security;
drop policy if exists dgii_certification_events_all on public.dgii_certification_events;
create policy dgii_certification_events_all on public.dgii_certification_events for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- ── 17) dgii_certification_evidence ──────────────────────────────────────────
-- Portada de agendapp: 20260727_dgii_certification_workflow.sql:118-133 (tabla),
-- línea 135-136 (índice) y 146-155 (FK diferida evento -> evidencia, porque en
-- la fuente `dgii_certification_events.evidence_id` se declara antes que esta
-- tabla exista).
create table if not exists public.dgii_certification_evidence (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.dgii_certification_applications(id) on delete cascade,
  business_id          uuid not null references public.businesses(id) on delete cascade,
  step_number          smallint not null check (step_number between 1 and 15),
  evidence_type        varchar(40) not null
    check (evidence_type in ('portal_screenshot','portal_message','file','note','external_reference')),
  source               varchar(40) not null default 'portal-dgii-official'
    check (source in ('portal-dgii-official','owner-manual','agendapp-system')),
  storage_path         text,      -- referencia al bucket privado; jamás el contenido
  content_sha256       varchar(64),
  portal_message       text,      -- texto oficial del Portal, tal cual lo reporta el propietario
  observed_at          timestamptz,
  uploaded_by_user_id  uuid,
  created_at           timestamptz not null default now()
);
create index if not exists dgii_cert_evidence_app_idx
  on public.dgii_certification_evidence (application_id, step_number, created_at desc);

alter table public.dgii_certification_evidence enable row level security;
drop policy if exists dgii_certification_evidence_all on public.dgii_certification_evidence;
create policy dgii_certification_evidence_all on public.dgii_certification_evidence for all
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

-- FK diferida de evento -> evidencia (dgii_certification_evidence se define
-- después de dgii_certification_events; ver nota arriba).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dgii_cert_event_evidence_fk'
  ) then
    alter table public.dgii_certification_events
      add constraint dgii_cert_event_evidence_fk
      foreign key (evidence_id) references public.dgii_certification_evidence(id) on delete set null;
  end if;
end $$;
