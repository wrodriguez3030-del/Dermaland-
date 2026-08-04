-- 0042 — Identidad normalizada del cliente (teléfono, WhatsApp, correo).
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
-- El ERP guarda el teléfono como lo escribe el mostrador: `829-714-1975`.
-- La tienda lo guardaba en crudo: `8297141975`. Buscar antes de crear la ficha
-- se hacía con un `=` literal, así que NUNCA casaban y el mismo señor acababa
-- con dos fichas. No es hipotético: pasó. `CLI-420678` y `CLI-573912` son la
-- misma persona con el mismo número escrito de dos maneras.
--
-- Una ficha duplicada parte el historial de compras en dos, y el día que
-- alguien mire cuánto ha gastado ese cliente verá la mitad.
--
-- La regla de normalización ya existía en TypeScript
-- (`features/customers/customer-normalization.ts`) y es la que usan la
-- detección de duplicados, el emparejamiento venta↔cliente y la búsqueda.
-- Aquí se escribe la MISMA regla en SQL para poder indexarla: sin índice, cada
-- pedido tendría que barrer la tabla entera de clientes para comparar.
--
-- NO se pone un índice ÚNICO a propósito. Dos personas de la misma casa
-- comparten un número —en esta misma base, `CLI-521212` lleva el WhatsApp de
-- `CLI-420678`— y un único los volvería imposibles de registrar. La regla es
-- "busca antes de crear", no "prohíbe repetir".

begin;

-- ── Las reglas, en SQL ──────────────────────────────────────────────────────
-- IMMUTABLE porque las columnas generadas lo exigen: Postgres necesita saber
-- que el valor calculado no cambia solo.

create or replace function public.normalize_phone_digits(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    case
      -- 11 dígitos que arrancan en 1 = prefijo de país (+1 809 …): se quita,
      -- porque `+1 829 714 1975` y `829-714-1975` son el mismo teléfono.
      when length(d) = 11 and left(d, 1) = '1' then right(d, 10)
      else d
    end,
    ''
  )
  from (select regexp_replace(coalesce(value, ''), '\D', '', 'g') as d) as s;
$$;

comment on function public.normalize_phone_digits(text) is
  'Teléfono a solo dígitos, sin prefijo +1. Espejo de normalizePhone() en customer-normalization.ts.';

create or replace function public.normalize_email_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(value, ''))), '');
$$;

comment on function public.normalize_email_text(text) is
  'Correo en minúscula y sin espacios. Espejo de normalizeEmail() en customer-normalization.ts.';

-- ── Las columnas ────────────────────────────────────────────────────────────
-- Generadas y almacenadas: se recalculan solas en cada UPDATE, así que no hay
-- forma de que la copia normalizada se separe del dato original.

alter table public.clients
  add column if not exists phone_digits text
    generated always as (public.normalize_phone_digits(phone)) stored,
  add column if not exists whatsapp_digits text
    generated always as (public.normalize_phone_digits(whatsapp)) stored,
  add column if not exists email_normalized text
    generated always as (public.normalize_email_text(email)) stored;

comment on column public.clients.phone_digits is
  'Derivada de phone. Para BUSCAR; nunca para mostrar — la pantalla enseña phone.';
comment on column public.clients.whatsapp_digits is
  'Derivada de whatsapp. Para BUSCAR; nunca para mostrar.';
comment on column public.clients.email_normalized is
  'Derivada de email. Para BUSCAR; nunca para mostrar.';

-- ── Los índices ─────────────────────────────────────────────────────────────
-- Parciales: las fichas borradas no cuentan como duplicado, y una columna nula
-- no se busca nunca.

create index if not exists clients_business_phone_digits_idx
  on public.clients (business_id, phone_digits)
  where deleted_at is null and phone_digits is not null;

create index if not exists clients_business_whatsapp_digits_idx
  on public.clients (business_id, whatsapp_digits)
  where deleted_at is null and whatsapp_digits is not null;

create index if not exists clients_business_email_normalized_idx
  on public.clients (business_id, email_normalized)
  where deleted_at is null and email_normalized is not null;

commit;

notify pgrst, 'reload schema';
