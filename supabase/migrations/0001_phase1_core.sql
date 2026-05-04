-- =====================================================================
-- DermaLand — Migración 0001 · Fase 1 (núcleo multiempresa)
-- Convenciones:
--   * UUID v7 (k-sortable) generados en app o por extensión `uuid-ossp` v7 cuando esté disponible.
--     Mientras tanto: `gen_random_uuid()` (v4) — TODO: reemplazar al actualizar pgcrypto/uuid.
--   * Toda tabla operativa lleva `business_id UUID NOT NULL` y RLS por
--     `current_business_id()` derivado de `auth.jwt()->>'business_id'`.
--   * Soft delete con `deleted_at TIMESTAMPTZ`.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'business_id', '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- businesses (tenant raíz)
-- ---------------------------------------------------------------------

CREATE TABLE public.businesses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            CITEXT NOT NULL UNIQUE,
  legal_name      TEXT NOT NULL,
  trade_name      TEXT NOT NULL,
  rnc             TEXT,
  country_code    CHAR(2) NOT NULL DEFAULT 'DO',
  default_currency CHAR(3) NOT NULL DEFAULT 'DOP',
  default_locale  TEXT NOT NULL DEFAULT 'es-DO',
  default_timezone TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
  contact_email   CITEXT,
  contact_phone   TEXT,
  contact_whatsapp TEXT,
  website_url     TEXT,
  instagram_handle TEXT,
  logo_url        TEXT,
  brand_primary   TEXT,
  brand_accent    TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','trial','cancelled')),
  dgii_enabled    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_businesses_status ON public.businesses (status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_businesses_touch
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- business_settings (key/value por business)
-- ---------------------------------------------------------------------

CREATE TABLE public.business_settings (
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  value        JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  PRIMARY KEY (business_id, key)
);

-- ---------------------------------------------------------------------
-- branches (sucursales)
-- ---------------------------------------------------------------------

CREATE TABLE public.branches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  address      TEXT,
  city         TEXT,
  province     TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'DO',
  phone        TEXT,
  whatsapp     TEXT,
  email        CITEXT,
  is_main      BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (business_id, code)
);

CREATE INDEX idx_branches_business ON public.branches (business_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uniq_branches_main ON public.branches (business_id) WHERE is_main = true AND deleted_at IS NULL;

CREATE TRIGGER trg_branches_touch
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- users (usuarios del tenant — extiende auth.users de Supabase)
-- ---------------------------------------------------------------------

CREATE TABLE public.users (
  id           UUID PRIMARY KEY,
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  email        CITEXT NOT NULL,
  full_name    TEXT NOT NULL,
  phone        TEXT,
  avatar_url   TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','invited','suspended')),
  invited_at   TIMESTAMPTZ,
  invited_by   UUID,
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT users_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uniq_users_business_email ON public.users (business_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_business ON public.users (business_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_touch
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- business_roles (roles definibles por tenant)
-- ---------------------------------------------------------------------

CREATE TABLE public.business_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  is_built_in  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE TRIGGER trg_business_roles_touch
BEFORE UPDATE ON public.business_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- permissions (catálogo global de permisos del sistema)
-- ---------------------------------------------------------------------

CREATE TABLE public.permissions (
  code         TEXT PRIMARY KEY,
  module       TEXT NOT NULL,
  description  TEXT NOT NULL,
  is_destructive BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.permissions (code, module, description, is_destructive) VALUES
  ('clients:read',        'clients', 'Ver clientes',           false),
  ('clients:write',       'clients', 'Crear/editar clientes',  false),
  ('clients:delete',      'clients', 'Eliminar clientes',      true),
  ('branches:read',       'branches','Ver sucursales',         false),
  ('branches:write',      'branches','Crear/editar sucursales',false),
  ('users:invite',        'users',   'Invitar usuarios',       false),
  ('users:assign_role',   'users',   'Asignar roles',          false),
  ('audit:read',          'audit',   'Leer auditoría',         false),
  ('business:settings',   'business','Configurar negocio',     false);

-- ---------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------

CREATE TABLE public.role_permissions (
  role_id          UUID NOT NULL REFERENCES public.business_roles(id) ON DELETE CASCADE,
  permission_code  TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE RESTRICT,
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_code)
);

-- ---------------------------------------------------------------------
-- user_role_assignments
-- ---------------------------------------------------------------------

CREATE TABLE public.user_role_assignments (
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.business_roles(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID,
  PRIMARY KEY (user_id, role_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- ---------------------------------------------------------------------
-- user_permission_overrides (allow/deny puntuales)
-- ---------------------------------------------------------------------

CREATE TABLE public.user_permission_overrides (
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_code  TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  effect           TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  PRIMARY KEY (user_id, permission_code)
);

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------

CREATE TABLE public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  actor_id     UUID,
  actor_type   TEXT NOT NULL DEFAULT 'user'
               CHECK (actor_type IN ('user','platform_admin','system','api_key')),
  action       TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id  TEXT,
  before_state JSONB,
  after_state  JSONB,
  metadata     JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business_created ON public.audit_logs (business_id, created_at DESC);
CREATE INDEX idx_audit_resource ON public.audit_logs (business_id, resource_type, resource_id);

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------

CREATE TABLE public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info','warn','error','success')),
  title        TEXT NOT NULL,
  body         TEXT,
  link_url     TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------
-- clients (CRM básico)
-- ---------------------------------------------------------------------

CREATE TABLE public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  display_code  TEXT NOT NULL,                              -- CLI-000001
  full_name     TEXT NOT NULL,
  document_type TEXT CHECK (document_type IN ('cedula','rnc','passport','none')),
  document_number TEXT,
  email         CITEXT,
  phone         TEXT,
  whatsapp      TEXT,
  birth_date    DATE,
  sex           TEXT CHECK (sex IN ('F','M','O')),
  address       TEXT,
  city          TEXT,
  notes         TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (business_id, display_code)
);

CREATE INDEX idx_clients_business ON public.clients (business_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_business_phone ON public.clients (business_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_business_doc ON public.clients (business_id, document_number) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_clients_touch
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- client_notes / client_files / client_comments
-- ---------------------------------------------------------------------

CREATE TABLE public.client_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_client_notes ON public.client_notes (business_id, client_id, created_at DESC);

CREATE TABLE public.client_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_files ON public.client_files (business_id, client_id, created_at DESC);

CREATE TABLE public.client_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES public.client_comments(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  edited_at   TIMESTAMPTZ
);

CREATE INDEX idx_client_comments ON public.client_comments (business_id, client_id, created_at);

-- ---------------------------------------------------------------------
-- platform_users (súper admin — fuera del modelo tenant)
-- ---------------------------------------------------------------------

CREATE TABLE public.platform_users (
  id           UUID PRIMARY KEY,
  email        CITEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('owner','admin','support','readonly')),
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','suspended')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_users_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TRIGGER trg_platform_users_touch
BEFORE UPDATE ON public.platform_users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- RLS — Row Level Security
-- =====================================================================

ALTER TABLE public.businesses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_users            ENABLE ROW LEVEL SECURITY;

-- businesses: el usuario solo ve su propio business (o platform admin ve todos)
CREATE POLICY businesses_tenant_select ON public.businesses
  FOR SELECT USING (id = current_business_id() OR is_platform_admin());

CREATE POLICY businesses_platform_write ON public.businesses
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Helper macro: las demás tablas usan el mismo patrón business_id = current_business_id()
-- SELECT
CREATE POLICY business_settings_tenant ON public.business_settings
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY branches_tenant ON public.branches
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY users_tenant ON public.users
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY business_roles_tenant ON public.business_roles
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY role_permissions_tenant ON public.role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.business_roles br
      WHERE br.id = role_permissions.role_id
        AND (br.business_id = current_business_id() OR is_platform_admin())
    )
  );

CREATE POLICY user_role_assignments_tenant ON public.user_role_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_role_assignments.user_id
        AND (u.business_id = current_business_id() OR is_platform_admin())
    )
  );

CREATE POLICY user_permission_overrides_tenant ON public.user_permission_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_permission_overrides.user_id
        AND (u.business_id = current_business_id() OR is_platform_admin())
    )
  );

CREATE POLICY audit_logs_tenant_read ON public.audit_logs
  FOR SELECT USING (business_id = current_business_id() OR is_platform_admin());

-- audit_logs solo se inserta vía Server Actions / Edge Functions con service_role
-- (no se permite INSERT directo desde el cliente). Sin policy de INSERT → bloqueado por defecto con RLS.

CREATE POLICY notifications_tenant ON public.notifications
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY clients_tenant ON public.clients
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY client_notes_tenant ON public.client_notes
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY client_files_tenant ON public.client_files
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

CREATE POLICY client_comments_tenant ON public.client_comments
  FOR ALL USING (business_id = current_business_id() OR is_platform_admin())
  WITH CHECK (business_id = current_business_id() OR is_platform_admin());

-- platform_users: solo platform admins
CREATE POLICY platform_users_self ON public.platform_users
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- =====================================================================
-- Seed — business piloto DermaLand (datos confirmados 2026-05-04)
-- =====================================================================

INSERT INTO public.businesses (
  id, slug, legal_name, trade_name, rnc,
  contact_email, contact_phone, contact_whatsapp,
  instagram_handle, brand_primary, brand_accent,
  status, dgii_enabled
) VALUES (
  '00000000-0000-0000-0000-00000000d001',
  'dermaland',
  'DermaLand SRL',
  'DermaLand',
  '132590775',
  'dermalandrd@gmail.com',
  '+18092265252',
  '+18092265252',
  'dermalandrd',
  '#2DB4A8',
  '#1A7F8E',
  'trial',
  false
);

INSERT INTO public.branches (
  id, business_id, code, name, address, city, province, country_code, phone, whatsapp, email, is_main, status
) VALUES (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-00000000d001',
  'SANTIAGO',
  'DermaLand Santiago',
  'Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este',
  'Santiago',
  'Santiago',
  'DO',
  '+18092265252',
  '+18092265252',
  'dermalandrd@gmail.com',
  true,
  'active'
);

-- Roles built-in para DermaLand business
INSERT INTO public.business_roles (id, business_id, code, name, description, is_built_in) VALUES
  ('00000000-0000-0000-0000-00000000r001', '00000000-0000-0000-0000-00000000d001', 'owner', 'Propietario', 'Acceso total dentro del negocio', true),
  ('00000000-0000-0000-0000-00000000r002', '00000000-0000-0000-0000-00000000d001', 'admin', 'Administrador', 'Administración operativa', true),
  ('00000000-0000-0000-0000-00000000r003', '00000000-0000-0000-0000-00000000d001', 'cashier', 'Cajero', 'Operación de POS', true),
  ('00000000-0000-0000-0000-00000000r004', '00000000-0000-0000-0000-00000000d001', 'inventory', 'Inventario', 'Conteos y recepciones', true);

-- Owner recibe todos los permisos de Fase 1
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-00000000r001', code FROM public.permissions;

-- Admin: todo excepto delete y settings de business
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT '00000000-0000-0000-0000-00000000r002', code
FROM public.permissions
WHERE code NOT IN ('clients:delete','business:settings');
