-- =============================================================================
-- DermaLand · Fase C — Seeds de roles + asignación rol → permisos
-- =============================================================================
-- Crea las tablas `roles` y `role_permissions`, inserta los 7 roles del
-- sistema (super_admin, admin, manager, cashier, inventory, supervisor,
-- auditor) y la matriz de asignación de los 18 permisos DGII/cash que
-- corresponde a `roleDefinitions` en `apps/web/src/lib/mock-data/users.ts`.
--
-- ─── ESTADO ────────────────────────────────────────────────────────────────
-- - **0005 NO ha sido aplicada todavía** en ningún ambiente Supabase.
-- - **Depende de aplicar primero 0003 y 0004** (en ese orden, aunque
--   0005 también incluye CREATE TABLE IF NOT EXISTS defensivos).
-- - **Se aplicará cuando el usuario autorice Fase C**.
-- - **DATA_SOURCE sigue en `mock`** mientras tanto — el código sigue
--   usando los repositorios mock.
--
-- ─── PROPIEDADES DE SEGURIDAD ──────────────────────────────────────────────
-- - 100% aditiva: solo `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT
--   DO NOTHING`. Cero `DROP`, cero `DELETE`, cero `TRUNCATE`.
-- - Idempotente: re-ejecutar la migración no causa errores ni duplicados.
-- - Las FKs a `permissions(code)` requieren que 0004 ya se haya aplicado.
--   Si 0004 no se aplicó, los INSERTs fallarán con error claro.
-- - No toca usuarios, no cambia roles existentes en `users.role`.
-- - No otorga permisos especiales a usuarios concretos — solo declara el
--   mapeo a nivel de rol.
--
-- ─── EN SYNC CON roleDefinitions ──────────────────────────────────────────
-- El test `apps/web/src/lib/mock-data/role-permissions-sync.test.ts`
-- verifica que cada par `(role_code, permission_code)` aquí coincida con
-- el resultado de `roleHasPermission()` sobre `roleDefinitions`. Si
-- cambias asignaciones en TS, actualiza este SQL o el test falla.
--
-- ─── ROLLBACK ─────────────────────────────────────────────────────────────
--   DELETE FROM role_permissions WHERE permission_code LIKE 'dgii:%' OR
--     permission_code IN ('cash:open','cash:close','cash:change_closing_percentage',
--       'cash:authorize_below_100_percent','cash:reverse_closing');
--   -- y opcionalmente borrar las tablas:
--   DROP TABLE IF EXISTS role_permissions CASCADE;
--   DROP TABLE IF EXISTS roles CASCADE;
-- =============================================================================

-- ─── Tabla `roles` (catálogo declarativo de roles del sistema) ──────────────
CREATE TABLE IF NOT EXISTS roles (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_read_all ON roles;
CREATE POLICY roles_read_all ON roles FOR SELECT USING (true);

-- ─── Tabla `role_permissions` (matriz N:M rol ↔ permiso) ───────────────────
-- Defensiva: 0004 ya creó `permissions` con PRIMARY KEY `code`, pero si
-- alguien aplica 0005 sin 0004, el FK explota con mensaje claro
-- ("relation permissions does not exist").
CREATE TABLE IF NOT EXISTS role_permissions (
  role_code text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_read_all ON role_permissions;
CREATE POLICY role_permissions_read_all ON role_permissions
  FOR SELECT USING (true);

-- ─── Seeds de roles ────────────────────────────────────────────────────────
INSERT INTO roles (code, label, description) VALUES
  ('super_admin', 'Súper Admin', 'Acceso total a la plataforma. Solo personal interno.'),
  ('admin', 'Admin', 'Administra el negocio: sucursales, usuarios, configuración.'),
  ('manager', 'Gerente de sucursal', 'Gestiona la sucursal asignada — POS, inventario, conteos.'),
  ('cashier', 'Cajero', 'Atiende ventas en POS, abre/cierra su caja.'),
  ('inventory', 'Inventario', 'Recepciones, conteos, ajustes con motivo.'),
  ('supervisor', 'Supervisor', 'Aprueba ajustes, revisa diferencias de conteo y autoriza cierres sensibles.'),
  ('auditor', 'Auditor', 'Solo lectura — auditoría, reportes, logs.')
ON CONFLICT (code) DO NOTHING;

-- ─── Seeds de asignación rol → permiso ──────────────────────────────────────
-- Derivado de `roleDefinitions` expandiendo wildcards (`dgii:*`, `cash:*`)
-- y patrones OR (`a|b|c`). Mantener en sync via test
-- `role-permissions-sync.test.ts`.

-- super_admin: todos los 18 permisos DGII/cash (vía `dgii:*` + `cash:*`)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'dgii:configure'),
  ('super_admin', 'dgii:certificate:upload'),
  ('super_admin', 'dgii:sequences:manage'),
  ('super_admin', 'dgii:invoices:generate_xml'),
  ('super_admin', 'dgii:invoices:validate_xml'),
  ('super_admin', 'dgii:invoices:sign'),
  ('super_admin', 'dgii:invoices:send'),
  ('super_admin', 'dgii:invoices:check_status'),
  ('super_admin', 'dgii:invoices:download_xml'),
  ('super_admin', 'dgii:invoices:download_pdf'),
  ('super_admin', 'dgii:credit_notes:create'),
  ('super_admin', 'dgii:reports:view'),
  ('super_admin', 'dgii:certification:run_tests'),
  ('super_admin', 'cash:open'),
  ('super_admin', 'cash:close'),
  ('super_admin', 'cash:change_closing_percentage'),
  ('super_admin', 'cash:authorize_below_100_percent'),
  ('super_admin', 'cash:reverse_closing')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- admin: todos los 18 permisos DGII/cash (vía `dgii:*` + `cash:*`)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('admin', 'dgii:configure'),
  ('admin', 'dgii:certificate:upload'),
  ('admin', 'dgii:sequences:manage'),
  ('admin', 'dgii:invoices:generate_xml'),
  ('admin', 'dgii:invoices:validate_xml'),
  ('admin', 'dgii:invoices:sign'),
  ('admin', 'dgii:invoices:send'),
  ('admin', 'dgii:invoices:check_status'),
  ('admin', 'dgii:invoices:download_xml'),
  ('admin', 'dgii:invoices:download_pdf'),
  ('admin', 'dgii:credit_notes:create'),
  ('admin', 'dgii:reports:view'),
  ('admin', 'dgii:certification:run_tests'),
  ('admin', 'cash:open'),
  ('admin', 'cash:close'),
  ('admin', 'cash:change_closing_percentage'),
  ('admin', 'cash:authorize_below_100_percent'),
  ('admin', 'cash:reverse_closing')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- manager: operación e-CF + NC + reports + cash básico (12 permisos)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('manager', 'dgii:invoices:generate_xml'),
  ('manager', 'dgii:invoices:validate_xml'),
  ('manager', 'dgii:invoices:sign'),
  ('manager', 'dgii:invoices:send'),
  ('manager', 'dgii:invoices:check_status'),
  ('manager', 'dgii:invoices:download_xml'),
  ('manager', 'dgii:invoices:download_pdf'),
  ('manager', 'dgii:credit_notes:create'),
  ('manager', 'dgii:reports:view'),
  ('manager', 'cash:open'),
  ('manager', 'cash:close'),
  ('manager', 'cash:change_closing_percentage')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- cashier: cobro tarjeta + entrega PDF + abrir/cerrar caja (4 permisos)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('cashier', 'dgii:invoices:generate_xml'),
  ('cashier', 'dgii:invoices:download_pdf'),
  ('cashier', 'cash:open'),
  ('cashier', 'cash:close')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- inventory: sin permisos DGII/cash (rol enfocado a inventario únicamente)
-- (no se insertan filas — esta sección queda intencionalmente vacía)

-- supervisor: aprobador de cierres sensibles + reportes (3 permisos)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('supervisor', 'dgii:reports:view'),
  ('supervisor', 'cash:authorize_below_100_percent'),
  ('supervisor', 'cash:reverse_closing')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- auditor: solo lectura DGII (4 permisos)
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('auditor', 'dgii:reports:view'),
  ('auditor', 'dgii:invoices:check_status'),
  ('auditor', 'dgii:invoices:download_xml'),
  ('auditor', 'dgii:invoices:download_pdf')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- ─── Validación post-seed (opcional, comentar en producción) ───────────────
-- Descomentar para ver el conteo por rol después de aplicar:
--   SELECT r.code, r.label, COUNT(rp.permission_code) AS n_permisos
--   FROM roles r LEFT JOIN role_permissions rp ON rp.role_code = r.code
--   GROUP BY r.code, r.label ORDER BY r.code;
--
-- Conteo esperado (DGII/cash):
--   super_admin: 18
--   admin:       18
--   manager:     12
--   cashier:      4
--   inventory:    0
--   supervisor:   3
--   auditor:      4
--   TOTAL:       59
