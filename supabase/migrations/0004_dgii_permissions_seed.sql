-- =============================================================================
-- DermaLand · Fase C — Seeds de permisos DGII / caja granulares
-- =============================================================================
-- Inserta los 18 permisos DGII y de caja en la tabla `permissions`.
--
-- IMPORTANTE: la tabla `permissions` NO se crea en 0001_phase1_core.sql
-- (la primera migración solo crea `users.role` como enum). Esta migración
-- crea la tabla `permissions` si no existe, luego inserta los seeds.
-- Idempotente: `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT (code) DO NOTHING`
-- permite re-ejecutar la migración sin errores.
--
-- Estos permisos deben coincidir con `DGII_RBAC_PENDING_KEYS` en
-- `apps/web/src/lib/mock-data/users.ts`. Si añades/quitas keys, actualiza
-- ambos sitios.
--
-- Esta migración:
--  - Crea la tabla `permissions` si no existe (catálogo declarativo).
--  - Activa RLS con política de solo-lectura para usuarios autenticados.
--  - Inserta los 18 permisos DGII/cash; respeta permisos preexistentes.
--  - NO modifica permisos existentes.
--  - NO toca usuarios ni roles.
--  - NO cambia el flag `dgii_enabled` en `businesses`.
--  - NO inserta datos reales (RNC, certificados, secuencias).
--  - Es 100% aditiva.
--
-- Rollback (si fuera necesario):
--   DELETE FROM permissions WHERE code LIKE 'dgii:%' OR code IN
--     ('cash:open','cash:close','cash:change_closing_percentage',
--      'cash:authorize_below_100_percent','cash:reverse_closing');
--   -- y si se quiere descartar la tabla entera:
--   DROP TABLE IF EXISTS permissions CASCADE;
-- =============================================================================

-- ─── Tabla `permissions` (catálogo declarativo) ────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  code text PRIMARY KEY,
  module text NOT NULL,
  description text NOT NULL,
  is_destructive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
-- Catálogo global: cualquier usuario autenticado lee, solo super_admin
-- escribe (escritura efectiva se hace vía migraciones, no por server actions).
DROP POLICY IF EXISTS permissions_read_all ON permissions;
CREATE POLICY permissions_read_all ON permissions
  FOR SELECT USING (true);

INSERT INTO permissions (code, module, description, is_destructive) VALUES
  ('dgii:configure', 'Configuración DGII', 'Editar configuración fiscal del business (RNC, ambiente, URLs)', false),
  ('dgii:certificate:upload', 'Certificado', 'Subir/reemplazar certificado digital .p12 del business', true),
  ('dgii:sequences:manage', 'Secuencias', 'Importar y gestionar secuencias e-NCF por tipo', true),
  ('dgii:invoices:generate_xml', 'Facturas electrónicas', 'Generar XML e-CF a partir de una venta/proforma', false),
  ('dgii:invoices:validate_xml', 'Facturas electrónicas', 'Ejecutar validación contra XSD oficial DGII', false),
  ('dgii:invoices:sign', 'Facturas electrónicas', 'Firmar el XML con el certificado digital del business', true),
  ('dgii:invoices:send', 'Facturas electrónicas', 'Enviar el XML firmado al endpoint DGII (ambiente actual)', true),
  ('dgii:invoices:check_status', 'Facturas electrónicas', 'Consultar estado/TrackId del comprobante en DGII', false),
  ('dgii:invoices:download_xml', 'Facturas electrónicas', 'Descargar el XML (firmado o sin firmar) del comprobante', false),
  ('dgii:invoices:download_pdf', 'Facturas electrónicas', 'Descargar la representación impresa (PDF) del comprobante', false),
  ('dgii:credit_notes:create', 'Notas de crédito', 'Crear Nota de Crédito (e-CF 34) desde un comprobante origen', true),
  ('dgii:reports:view', 'Reportes', 'Ver reportes fiscales DGII (por tipo, estado, secuencias)', false),
  ('dgii:certification:run_tests', 'Pre-certificación', 'Ejecutar el set de pruebas internas contra ambiente testecf', false),
  ('cash:open', 'Caja/cierre', 'Abrir sesión de caja', false),
  ('cash:close', 'Caja/cierre', 'Cerrar sesión de caja', true),
  ('cash:change_closing_percentage', 'Caja/cierre', 'Cambiar el % de proformas a convertir en e-CF durante el cierre', true),
  ('cash:authorize_below_100_percent', 'Caja/cierre', 'Autorizar cierres con % < 100 (requiere comentario)', true),
  ('cash:reverse_closing', 'Caja/cierre', 'Reversar un cierre confirmado (proceso especial con auditoría)', true)
ON CONFLICT (code) DO NOTHING;
