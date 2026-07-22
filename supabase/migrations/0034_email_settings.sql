-- 0034_email_settings — Configuración de correo por negocio.
--
-- Guarda el usuario Gmail + la "contraseña de aplicación" CIFRADA (AES-256-GCM,
-- misma master key que las credenciales de IA). La contraseña NUNCA se guarda en
-- claro ni se devuelve al cliente. RLS por business_id (helper auth_business_id).
-- Aplicada a prod vía MCP el 2026-07-22; este archivo la deja versionada.

create table if not exists public.email_settings (
  business_id uuid primary key,
  gmail_user text not null default 'dermalandrd@gmail.com',
  encrypted_password text,
  iv text,
  auth_tag text,
  encryption_version integer not null default 1,
  last_four text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.email_settings is
  'Config de correo por negocio: usuario Gmail + contraseña de aplicación cifrada (AES-256-GCM). La contraseña NUNCA se guarda en claro ni se devuelve al cliente.';

alter table public.email_settings enable row level security;

drop policy if exists email_settings_tenant on public.email_settings;
create policy email_settings_tenant on public.email_settings
  for all
  using (business_id = (select auth_business_id()))
  with check (business_id = (select auth_business_id()));

grant select, insert, update, delete on public.email_settings to authenticated, service_role;
