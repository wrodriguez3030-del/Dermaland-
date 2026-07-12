-- SEC-001 — Endurecer helpers de autorización RLS: quitar el fallback a
-- `user_metadata` (escribible por el propio usuario vía auth.updateUser), que
-- permitía a un usuario auto-asignarse `business_id` o `is_platform_admin`.
--
-- Los claims de autorización se leen SOLO de:
--   1. claim raíz (Custom Access Token Hook, si se usa en el futuro)
--   2. app_metadata (Admin API / service_role — NO escribible por el usuario)
--
-- 100% aditiva (CREATE OR REPLACE). No toca tablas ni datos. Los usuarios
-- legítimos ya tienen estos claims en app_metadata, así que NO se bloquea a
-- nadie. Reversible reaplicando la 0006.
--
-- PENDIENTE (fuera de esta migración, requiere confirmación por tocar auth.users
-- en prod): limpiar los claims sensibles ya presentes en
-- raw_user_meta_data de los usuarios existentes.

create or replace function public.auth_business_id()
  returns uuid
  language sql
  stable
  set search_path = public, auth, extensions
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'business_id', '')
  )::uuid;
$$;

create or replace function public.auth_is_platform_admin()
  returns boolean
  language sql
  stable
  set search_path = public, auth, extensions
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'is_platform_admin')::boolean,
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_platform_admin')::boolean,
    false
  );
$$;

notify pgrst, 'reload schema';
