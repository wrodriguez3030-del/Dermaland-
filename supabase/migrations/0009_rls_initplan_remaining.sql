-- =============================================================================
-- DermaLand · 0009 — Auth RLS Init-Plan en policies _all restantes
-- =============================================================================
-- Follow-up de 0008. Autorizado explícitamente 2026-05-29.
--
-- Envuelve las llamadas a auth_business_id() / auth_is_platform_admin() en
-- (select ...) dentro de las policies que 0008 NO tocó (las que tienen UNA sola
-- policy permissive `FOR ALL` y por tanto no tenían problema de "multiple
-- permissive", pero sí el warning "Auth RLS Initialization Plan").
--
-- 100% behavior-preserving: solo cambia el PLAN de ejecución (la función STABLE
-- pasa a evaluarse UNA vez por query en vez de por fila). NO cambia la condición
-- de acceso, NO abre cross-tenant, NO renombra policies, NO hace DROP.
-- Usa ALTER POLICY (no destructivo). Idempotente.
--
-- NO es una acción fiscal: no llama DGII, no testecf, no XML, no toca
-- certificados ni secuencias. Solo metadato del plan RLS, incluso en tablas
-- DGII (dgii_*, ecf_sequences, electronic_invoice*), cuya lógica de negocio
-- queda intacta.
--
-- Tablas ya cubiertas por 0008 (NO se repiten aquí): plans, businesses,
-- branches, users, clients, audit_logs.
-- =============================================================================

-- ── platform_users (SELECT: solo platform admin) ────────────────────────────
alter policy platform_users_select on public.platform_users
  using ((select public.auth_is_platform_admin()));

-- ── Núcleo / inventario (FOR ALL: business_id propio) ───────────────────────
alter policy warehouses_all on public.warehouses
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy brands_all on public.brands
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy laboratories_all on public.laboratories
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy product_categories_all on public.product_categories
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy products_all on public.products
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy product_lots_all on public.product_lots
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_movements_all on public.inventory_movements
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_counts_all on public.inventory_counts
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_count_scans_all on public.inventory_count_scans
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_count_items_all on public.inventory_count_items
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_count_evidence_all on public.inventory_count_evidence
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy inventory_count_sync_logs_all on public.inventory_count_sync_logs
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy lot_quarantine_all on public.lot_quarantine
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy lot_recalls_all on public.lot_recalls
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));

-- ── DGII / POS (FOR ALL: business_id propio) ────────────────────────────────
-- Solo se optimiza el plan RLS. La lógica fiscal/POS no cambia.
alter policy dgii_settings_all on public.dgii_settings
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy dgii_certificates_all on public.dgii_certificates
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy ecf_sequences_all on public.ecf_sequences
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy payment_methods_all on public.payment_methods
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy cash_registers_all on public.cash_registers
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy cash_register_sessions_all on public.cash_register_sessions
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy proformas_all on public.proformas
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy proforma_items_all on public.proforma_items
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy proforma_payments_all on public.proforma_payments
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy cash_closings_all on public.cash_closings
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy cash_closing_sales_all on public.cash_closing_sales
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy cash_closing_percentage_logs_all on public.cash_closing_percentage_logs
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy proforma_to_ecf_logs_all on public.proforma_to_ecf_logs
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy electronic_invoices_all on public.electronic_invoices
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy electronic_invoice_items_all on public.electronic_invoice_items
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy dgii_submissions_all on public.dgii_submissions
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy dgii_status_logs_all on public.dgii_status_logs
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy dgii_received_ecf_all on public.dgii_received_ecf
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
alter policy dgii_commercial_approvals_all on public.dgii_commercial_approvals
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));

-- =============================================================================
-- Verificación (SELECT-only): ninguna policy debe quedar con auth_*() "desnudo".
--   select tablename, policyname, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and (qual ~ '(?<!select )auth_business_id\(\)'
--           or with_check ~ '(?<!select )auth_business_id\(\)');
-- (debe devolver 0 filas tras aplicar 0008 + 0009)
-- =============================================================================
