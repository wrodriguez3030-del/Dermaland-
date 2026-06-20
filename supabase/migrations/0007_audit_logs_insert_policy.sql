-- =============================================================================
-- DermaLand - audit_logs: policy de INSERT con guardia business_id
-- =============================================================================
-- La tabla audit_logs (creada en 0001) solo tenía policy SELECT. El INSERT
-- estaba reservado a `service_role` (que bypasea RLS), pero los flujos
-- ejecutados con el JWT del usuario (ej. /dgii/certificado, prueba local
-- de certificado, server actions con cliente anon+JWT) tiraban
-- `new row violates row-level security policy for table "audit_logs"`.
--
-- Esta migración agrega `audit_logs_insert` que permite insertar
-- únicamente cuando:
--   1. business_id del row = business_id del JWT (sin cross-business).
--   2. user_id del row coincide con auth.uid() del JWT (o es NULL para
--      acciones del sistema). Bloquea suplantar auditoría de otro usuario.
--
-- Producción y service_role no se ven afectados — service_role bypasea
-- RLS y sigue pudiendo escribir filas con cualquier business_id (uso
-- legítimo: jobs de admin, bootstrap, migraciones).
--
-- 100% aditiva (CREATE POLICY IF NOT EXISTS via guard manual). No toca
-- datos, no cambia el SELECT existente, no afecta otras tablas.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_insert'
  ) then
    create policy audit_logs_insert on audit_logs
      for insert
      with check (
        business_id = auth_business_id()
        and (user_id is null or user_id = auth.uid())
      );
  end if;
end$$;

-- Documenta la regla en el comentario de la tabla.
comment on policy audit_logs_insert on audit_logs is
  'INSERT permitido a usuarios autenticados solo cuando business_id = auth_business_id() y user_id es NULL o coincide con auth.uid(). Service role bypasea RLS.';
