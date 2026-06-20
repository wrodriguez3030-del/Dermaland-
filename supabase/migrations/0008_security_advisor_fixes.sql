-- =============================================================================
-- DermaLand · 0008 — Correcciones de Supabase Security Advisor
-- =============================================================================
-- Migración 100% NO destructiva. No borra datos, no hace DROP de tablas/columnas,
-- no TRUNCATE, no toca DGII real ni certificados. Solo ajusta metadatos de
-- objetos (view, funciones) y reorganiza policies RLS preservando exactamente
-- la semántica de acceso multi-tenant existente.
--
-- Idempotente: se puede correr N veces sin efecto colateral.
--
-- Cubre los avisos del Security Advisor:
--   1. Security Definer View       -> public.inventory_stock_by_lot
--   2. Auth RLS Initialization Plan-> public.audit_logs
--   3. Function Search Path Mutable-> select_lot_for_sale, auth_business_id,
--                                     auth_is_platform_admin,
--                                     reserve_ecf_sequence_number
--   4. Multiple Permissive Policies-> plans, businesses, branches, users, clients
--
-- NO cubre (requiere acción manual en Dashboard, ver runbook):
--   - Leaked Password Protection (Authentication → Settings → Security)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- TAREA 2 · Security Definer View → security_invoker
-- ─────────────────────────────────────────────────────────────────────────────
-- La view normal corre con privilegios del owner (postgres) y BYPASEA la RLS de
-- product_lots → riesgo de fuga cross-tenant. Con security_invoker=true la view
-- respeta la RLS del usuario que consulta (product_lots_all: business_id =
-- auth_business_id()), que es justo el comportamiento multi-tenant correcto.
-- No cambia columnas ni datos; service_role sigue bypaseando RLS como antes.
alter view public.inventory_stock_by_lot set (security_invoker = true);


-- ─────────────────────────────────────────────────────────────────────────────
-- TAREA 4 · Function Search Path Mutable → search_path explícito
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin search_path fijo, un schema malicioso en el search_path del caller podría
-- secuestrar referencias no calificadas. Fijamos search_path explícito. NO se
-- cambia el cuerpo ni la volatilidad ni el security model (siguen SECURITY
-- INVOKER); solo se agrega el atributo. `public` es necesario porque dos de las
-- funciones referencian tablas sin calificar (product_lots, ecf_sequences).
alter function public.auth_business_id()
  set search_path = public, auth, extensions;

alter function public.auth_is_platform_admin()
  set search_path = public, auth, extensions;

alter function public.select_lot_for_sale(uuid, uuid, uuid)
  set search_path = public, auth, extensions;

alter function public.reserve_ecf_sequence_number(uuid, text, text)
  set search_path = public, auth, extensions;


-- ─────────────────────────────────────────────────────────────────────────────
-- TAREA 3 · Auth RLS Initialization Plan → envolver auth.*() en (select ...)
-- ─────────────────────────────────────────────────────────────────────────────
-- Llamar auth_business_id()/auth.uid() directo hace que Postgres re-evalúe la
-- función por CADA fila. Envolver en (select ...) deja que el planner la evalúe
-- UNA vez (InitPlan). Misma semántica, mismo aislamiento por business_id.
-- Usamos ALTER POLICY (no destructivo, conserva la policy y su nombre).
alter policy audit_logs_select on public.audit_logs
  using (business_id = (select public.auth_business_id()));

alter policy audit_logs_insert on public.audit_logs
  with check (
    business_id = (select public.auth_business_id())
    and (user_id is null or user_id = (select auth.uid()))
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TAREA 5 · Multiple Permissive Policies → una policy por (acción) sin solape
-- ─────────────────────────────────────────────────────────────────────────────
-- Patrón problemático: una policy FOR ALL + una FOR SELECT (a veces + self_update)
-- sobre la misma tabla/rol → 2+ policies PERMISSIVE para SELECT (y a veces UPDATE),
-- que Postgres evalúa todas por fila. Las consolidamos en exactamente una policy
-- por comando (select/insert/update/delete). Como las policies PERMISSIVE se
-- combinan con OR, la unión de condiciones preserva el acceso EXACTO previo.
-- Además se aprovecha para envolver auth.*() en (select ...) (InitPlan).
--
-- Estrategia idempotente: DROP POLICY IF EXISTS de las viejas y de las nuevas,
-- luego CREATE. Todo dentro de la transacción de la migración → sin ventana de
-- exposición.

-- ··· plans ···································································
-- Antes: plans_select (SELECT, true) + plans_admin (ALL, is_platform_admin).
-- Solape en SELECT. SELECT efectivo = true OR admin = true. Mantenemos SELECT
-- abierto (catálogo público) y dejamos admin solo para escritura.
drop policy if exists plans_admin on public.plans;
drop policy if exists plans_select on public.plans;
drop policy if exists plans_admin_insert on public.plans;
drop policy if exists plans_admin_update on public.plans;
drop policy if exists plans_admin_delete on public.plans;

create policy plans_select on public.plans
  for select using (true);
create policy plans_admin_insert on public.plans
  for insert with check ((select public.auth_is_platform_admin()));
create policy plans_admin_update on public.plans
  for update using ((select public.auth_is_platform_admin()))
  with check ((select public.auth_is_platform_admin()));
create policy plans_admin_delete on public.plans
  for delete using ((select public.auth_is_platform_admin()));

-- ··· businesses ······························································
-- Antes: businesses_select (SELECT: admin OR id=biz) + businesses_admin_all
-- (ALL: admin) + businesses_self_update (UPDATE: id=biz).
-- Solape en SELECT y en UPDATE. Unión preservada por comando.
drop policy if exists businesses_select on public.businesses;
drop policy if exists businesses_admin_all on public.businesses;
drop policy if exists businesses_self_update on public.businesses;
drop policy if exists businesses_sel on public.businesses;
drop policy if exists businesses_ins on public.businesses;
drop policy if exists businesses_upd on public.businesses;
drop policy if exists businesses_del on public.businesses;

create policy businesses_sel on public.businesses
  for select using (
    (select public.auth_is_platform_admin()) or id = (select public.auth_business_id())
  );
create policy businesses_ins on public.businesses
  for insert with check ((select public.auth_is_platform_admin()));
create policy businesses_upd on public.businesses
  for update using (
    (select public.auth_is_platform_admin()) or id = (select public.auth_business_id())
  ) with check (
    (select public.auth_is_platform_admin()) or id = (select public.auth_business_id())
  );
create policy businesses_del on public.businesses
  for delete using ((select public.auth_is_platform_admin()));

-- ··· branches ································································
-- Antes: branches_select (SELECT: biz OR admin) + branches_write (ALL: biz).
-- Solape en SELECT. Escritura sigue restringida a business_id propio (admin no
-- escribía branches antes y se mantiene así).
drop policy if exists branches_select on public.branches;
drop policy if exists branches_write on public.branches;
drop policy if exists branches_sel on public.branches;
drop policy if exists branches_ins on public.branches;
drop policy if exists branches_upd on public.branches;
drop policy if exists branches_del on public.branches;

create policy branches_sel on public.branches
  for select using (
    business_id = (select public.auth_business_id()) or (select public.auth_is_platform_admin())
  );
create policy branches_ins on public.branches
  for insert with check (business_id = (select public.auth_business_id()));
create policy branches_upd on public.branches
  for update using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
create policy branches_del on public.branches
  for delete using (business_id = (select public.auth_business_id()));

-- ··· users ···································································
-- Antes: users_select (SELECT: biz) + users_admin_write (ALL: biz).
-- Solape en SELECT. Misma condición business_id propio para todo.
drop policy if exists users_select on public.users;
drop policy if exists users_admin_write on public.users;
drop policy if exists users_sel on public.users;
drop policy if exists users_ins on public.users;
drop policy if exists users_upd on public.users;
drop policy if exists users_del on public.users;

create policy users_sel on public.users
  for select using (business_id = (select public.auth_business_id()));
create policy users_ins on public.users
  for insert with check (business_id = (select public.auth_business_id()));
create policy users_upd on public.users
  for update using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
create policy users_del on public.users
  for delete using (business_id = (select public.auth_business_id()));

-- ··· clients ·································································
-- Antes: clients_select (SELECT: biz) + clients_write (ALL: biz).
-- Solape en SELECT. Misma condición business_id propio para todo.
drop policy if exists clients_select on public.clients;
drop policy if exists clients_write on public.clients;
drop policy if exists clients_sel on public.clients;
drop policy if exists clients_ins on public.clients;
drop policy if exists clients_upd on public.clients;
drop policy if exists clients_del on public.clients;

create policy clients_sel on public.clients
  for select using (business_id = (select public.auth_business_id()));
create policy clients_ins on public.clients
  for insert with check (business_id = (select public.auth_business_id()));
create policy clients_upd on public.clients
  for update using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
create policy clients_del on public.clients
  for delete using (business_id = (select public.auth_business_id()));


-- =============================================================================
-- Verificación post-migración (correr manualmente; SELECT-only, no muta nada):
--
--   -- view consultable + security_invoker activo:
--   select relname, reloptions from pg_class
--    where relname = 'inventory_stock_by_lot';
--   select count(*) from public.inventory_stock_by_lot;  -- no debe fallar
--
--   -- funciones con search_path fijo:
--   select proname, proconfig from pg_proc
--    where proname in ('select_lot_for_sale','auth_business_id',
--                      'auth_is_platform_admin','reserve_ecf_sequence_number');
--
--   -- una sola policy permissive por (tabla, comando):
--   select tablename, cmd, count(*) from pg_policies
--    where schemaname='public'
--      and tablename in ('plans','businesses','branches','users','clients','audit_logs')
--    group by tablename, cmd order by tablename, cmd;
-- =============================================================================
