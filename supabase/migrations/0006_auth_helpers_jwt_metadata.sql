-- =============================================================================
-- DermaLand - Fase C (post) - Ajuste de helpers auth para leer user_metadata
-- =============================================================================
-- Supabase entrega los claims `user_metadata` y `app_metadata` como
-- sub-objetos del JWT (no en el root). El codigo TS
-- (`src/server/auth/context.ts`) lee `sbUser.user_metadata`. Para que la
-- proteccion RLS (`auth_business_id()`) tambien funcione, esta migracion
-- actualiza la funcion para leer en este orden:
--
--   1. claims->>'business_id'                  (raiz; uso futuro con
--                                               Custom Access Token Hook)
--   2. claims->'app_metadata'->>'business_id'  (Admin API setea aqui;
--                                               solo modificable por
--                                               service_role => preferido)
--   3. claims->'user_metadata'->>'business_id' (fallback)
--
-- Mismo patron para `auth_is_platform_admin()`.
--
-- 100% aditiva (CREATE OR REPLACE). No toca tablas ni datos.
-- =============================================================================

create or replace function public.auth_business_id()
  returns uuid
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'business_id', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'business_id', '')
    )::uuid;
  $$;

create or replace function public.auth_is_platform_admin()
  returns boolean
  language sql
  stable
  as $$
    select coalesce(
      (current_setting('request.jwt.claims', true)::jsonb ->> 'is_platform_admin')::boolean,
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_platform_admin')::boolean,
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'is_platform_admin')::boolean,
      false
    );
  $$;
