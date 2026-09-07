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
  set_at       timestamptz not null default now(),
  -- `stale`: la clave cambió por fuera del panel (trigger de la migración
  -- 20260909100200) y lo que hay en la bóveda ya no abre la cuenta. El ojo
  -- lo dice en vez de enseñar una clave vieja como si sirviera.
  stale          boolean not null default false,
  view_count     integer not null default 0,
  last_viewed_at timestamptz,
  last_viewed_by uuid references public.users(id) on delete set null
);
alter table public.user_password_vault
  add column if not exists stale          boolean not null default false,
  add column if not exists view_count     integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_viewed_by uuid references public.users(id) on delete set null;
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
  -- 0 = pedirlo siempre, y es el valor por defecto: nada cambia hasta que el
  -- administrador lo fije en el panel. El máximo (90) es decisión de negocio.
  trusted_device_days  int not null default 0
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
-- el servidor, no aquí. Sin este revoke, la ausencia de política de escritura
-- ya bloquea, pero decirlo explícito evita que una política futura lo abra.
revoke insert, update, delete on public.security_settings from anon, authenticated;

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
  revoked_at    timestamptz,
  -- Factor TOTP con el que se emitió: si ese factor se retira (desactivar 2FA,
  -- break-glass), el dispositivo deja de valer solo, sin limpieza aparte.
  factor_id     uuid,
  revoked_by    uuid,
  revoke_reason text
);
alter table public.trusted_devices
  add column if not exists factor_id     uuid,
  add column if not exists revoked_by    uuid,
  add column if not exists revoke_reason text;
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
revoke insert, update, delete on public.trusted_devices from anon, authenticated;

-- Comprobación que hace el middleware con la sesión del usuario (aal1). Acotada
-- a `auth.uid()`: nadie comprueba dispositivos ajenos. Reevalúa los días
-- VIGENTES del negocio en cada uso: si el administrador baja el valor, los
-- dispositivos ya emitidos caducan al instante. Devuelve el `factor_id` con el
-- que se emitió (el middleware exige que siga verificado) o null.
create or replace function public.mfa_trusted_device_check(p_device_id uuid, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d    public.trusted_devices;
  dias integer;
begin
  select * into d
    from public.trusted_devices
   where id = p_device_id
     and user_id = auth.uid()
     and revoked_at is null
     and token_hash = p_token_hash;
  if not found then
    return null;
  end if;
  select trusted_device_days into dias
    from public.security_settings
   where business_id = d.business_id;
  if coalesce(dias, 0) <= 0 then
    return null;
  end if;
  if now() > least(d.expires_at, d.created_at + make_interval(days => dias)) then
    return null;
  end if;
  -- `last_used_at` como mucho cada 5 minutos: una escritura por petición sería
  -- un coste sin información.
  update public.trusted_devices
     set last_used_at = now()
   where id = d.id
     and last_used_at < now() - interval '5 minutes';
  return d.factor_id;
end $$;
revoke all on function public.mfa_trusted_device_check(uuid, text) from public, anon;
grant execute on function public.mfa_trusted_device_check(uuid, text) to authenticated, service_role;

-- ── Resumen de acceso para el panel ─────────────────────────────────────────
-- SOLO service_role: expone 2FA, bloqueo y último acceso de todo el personal,
-- y eso no lo ve una cajera. La ruta comprueba que quien pregunta es admin.
create or replace function public.resumen_acceso_usuarios(p_business_id uuid)
returns table (
  user_id              uuid,
  tiene_cuenta         boolean,
  ultimo_acceso        timestamptz,
  bloqueado            boolean,
  totp_verificados     integer,
  clave_gestionada     boolean,
  clave_desincronizada boolean,
  clave_asignada_en    timestamptz,
  dispositivos_activos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         (a.id is not null),
         a.last_sign_in_at,
         (a.banned_until is not null and a.banned_until > now()),
         (select count(*)::int from auth.mfa_factors f
           where f.user_id = u.id and f.status = 'verified' and f.factor_type = 'totp'),
         (v.user_id is not null),
         coalesce(v.stale, false),
         v.set_at,
         (select count(*) from public.trusted_devices d
           where d.user_id = u.id and d.revoked_at is null and d.expires_at > now())
    from public.users u
    left join auth.users a on a.id = u.id
    left join public.user_password_vault v on v.user_id = u.id
   where u.business_id = p_business_id
     and u.deleted_at is null
$$;
revoke all on function public.resumen_acceso_usuarios(uuid) from public, anon, authenticated;
grant execute on function public.resumen_acceso_usuarios(uuid) to service_role;

-- ── `public.users` se escribe SOLO desde el servidor ────────────────────────
-- 🔴 Hallazgo de la revisión de diseño (07/09/2026), verificado en
-- 0008_security_advisor_fixes.sql:162-175: `users_ins`/`users_upd`/`users_del`
-- dejaban que CUALQUIER usuario del negocio escribiera CUALQUIER fila de
-- `users` por PostgREST, rol incluido. Hoy solo engañaba al panel (los claims
-- salen de app_metadata), pero con cuentas creadas desde la ficha sería
-- escalada a administrador. La lectura (`users_sel`) se conserva.
--
-- 🔴 ORDEN: aplicar DESPUÉS de desplegar el código que escribe `users` con
-- service_role (rutas de /api/users). Antes, «Nuevo usuario» dejaría de funcionar.
drop policy if exists users_ins on public.users;
drop policy if exists users_upd on public.users;
drop policy if exists users_del on public.users;
revoke insert, update, delete on public.users from anon, authenticated;

-- ── super_admin en la ficha ─────────────────────────────────────────────────
-- Misma técnica que 0021. La app JAMÁS escribe este valor: solo el script del
-- dueño (`scripts/auth/nombrar-super-admin.mjs`), que también pone el claim.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in
  ('super_admin','admin','manager','cashier','inventory','supervisor','auditor','vendedor'));

notify pgrst, 'reload schema';
