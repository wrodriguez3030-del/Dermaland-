-- Cuentas de acceso administradas desde el panel: bóveda de claves, ajustes
-- de seguridad del negocio y computadoras de confianza para el doble factor.
--
-- Por qué existe (pedido del dueño, 08/09/2026): hoy solo 2 de los 8 usuarios
-- tienen cuenta en Auth; el resto no puede entrar. El dueño quiere que admin y
-- super_admin CREEN la cuenta y ASIGNEN la clave de cada usuario desde el panel,
-- y poder verla después «con el ojo». Eligió guardar las claves legibles
-- sabiendo el riesgo; se guardan CIFRADAS (AES-256-GCM con una llave que solo
-- tiene el servidor, `USER_PASSWORD_VAULT_KEY`) y cada lectura queda en
-- `audit_logs`. Aquí nunca entra una clave en claro.
--
-- Convención que se respeta: `public.users.id` es el MISMO id que
-- `auth.users.id` (ver 0001_phase1_core.sql). Las cuentas nuevas se crean con
-- ese id, así que las FKs de abajo apuntan a `public.users`.

-- ── Bóveda ──────────────────────────────────────────────────────────────────
create table if not exists public.user_password_vault (
  user_id      uuid primary key references public.users(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  -- `SealedSecret` de `features/dgii/core/certificate-encryption.ts`:
  -- {iv, tag, ciphertext} en base64. Sin la llave del servidor es ruido.
  sealed       jsonb not null,
  set_by       uuid references public.users(id) on delete set null,
  set_at       timestamptz not null default now()
);
comment on table public.user_password_vault is
  'Clave asignada desde el panel, cifrada con la llave del servidor. Solo service_role la lee; cada lectura se audita (user.password.reveal).';

alter table public.user_password_vault enable row level security;
-- Sin políticas a propósito: ni `anon` ni `authenticated` ven una fila. Solo
-- service_role (que se salta RLS) desde el servidor.
revoke all on public.user_password_vault from anon, authenticated;

-- ── Ajustes de seguridad del negocio ────────────────────────────────────────
create table if not exists public.security_settings (
  business_id          uuid primary key references public.businesses(id) on delete cascade,
  -- Días que una computadora queda de confianza tras superar el doble factor.
  -- 0 = pedirlo siempre. El máximo (90) es una decisión de negocio, no técnica.
  trusted_device_days  int not null default 30
                       check (trusted_device_days between 0 and 90),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.users(id) on delete set null
);
comment on column public.security_settings.trusted_device_days is
  'Días que una computadora queda de confianza tras el doble factor (0 = pedirlo siempre). Lo fija el administrador en el panel.';

alter table public.security_settings enable row level security;
drop policy if exists "security_settings_select_propio" on public.security_settings;
create policy "security_settings_select_propio" on public.security_settings
  for select to authenticated
  using (business_id = (auth.jwt() -> 'app_metadata' ->> 'business_id')::uuid);
-- La escritura va por la API con service_role; el rol (admin) se comprueba en
-- el servidor, no aquí.

-- ── Computadoras de confianza ───────────────────────────────────────────────
create table if not exists public.trusted_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  -- sha256 (hex) del token que viaja en la galleta. El token NUNCA se guarda:
  -- quien lea esta tabla no puede fabricar una galleta válida.
  token_hash    text not null unique,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
comment on table public.trusted_devices is
  'Una fila por computadora que superó el doble factor con «recordar». Vive `trusted_device_days`; se revoca desde el panel o desde el perfil.';

create index if not exists trusted_devices_user_idx
  on public.trusted_devices(user_id) where revoked_at is null;

alter table public.trusted_devices enable row level security;
drop policy if exists "trusted_devices_select_propio" on public.trusted_devices;
create policy "trusted_devices_select_propio" on public.trusted_devices
  for select to authenticated
  using (user_id = auth.uid());
-- Insertar, revocar y borrar: solo service_role desde el servidor. Un usuario
-- no puede darse de alta una computadora de confianza sin pasar por el desafío.

notify pgrst, 'reload schema';
