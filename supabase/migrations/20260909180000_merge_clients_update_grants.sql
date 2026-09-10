-- Complemento de `merge_clients` (20260909170000): tres de las 7 tablas que
-- reasigna NO tenían cómo aceptar un UPDATE de un usuario autenticado normal.
--
-- Descubierto en vivo (scripts/test/customer-merge-test.mjs) al probar la
-- función recién aplicada:
--   - `client_auth_links` y `web_orders`: sin GRANT de UPDATE a `authenticated`
--     → "permission denied for table ..." (falla dura, aborta la transacción).
--   - `alegra_invoices`, `client_auth_links`, `web_orders`: solo tenían
--     política RLS de SELECT, ninguna de UPDATE → aunque el GRANT existiera,
--     RLS habría filtrado la fila a "no visible para UPDATE" y el UPDATE
--     habría afectado 0 filas EN SILENCIO (el caso más común: 6 521 de 6 525
--     clientes tienen filas en `alegra_invoices`).
--
-- Fix mínimo: SOLO agrega UPDATE (no INSERT/DELETE, que estas tres tablas no
-- necesitan para esta función y cuyo flujo de escritura real vive en otro
-- lado — service_role para client_auth_links/web_orders, importador de
-- Alegra para alegra_invoices). Política scoped por `business_id`, mismo
-- criterio que `ar_promises_all`/`electronic_invoices_all`/`proformas_all`
-- (sin filtro de rol adicional — igual que esas tres, consistente con el
-- modelo de seguridad ya aceptado de este esquema).

grant update on public.client_auth_links to authenticated;
grant update on public.web_orders to authenticated;

create policy alegra_invoices_upd on public.alegra_invoices
  for update
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy client_auth_links_upd on public.client_auth_links
  for update
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

create policy web_orders_upd on public.web_orders
  for update
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id());

notify pgrst, 'reload schema';
