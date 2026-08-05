-- 0045 — Idempotencia fiscal e historial de eventos.
--
-- POR QUÉ EN LA BASE Y NO SOLO EN EL CÓDIGO
--
-- Un e-NCF es un número que la DGII te dio y que solo puedes gastar una vez.
-- Enviarlo dos veces se arregla con papeles, no con un `DELETE`.
--
-- Una comprobación en TypeScript no puede impedirlo: en Vercel hay varias
-- funciones sin servidor atendiendo a la vez, y "leer, comprobar, escribir" no
-- es atómico entre ellas. Dos peticiones simultáneas leen las dos «no existe» y
-- las dos envían.
--
-- Lo único que lo impide de verdad es un índice único: la segunda choca contra
-- la base, no contra la DGII.
--
-- Se aplica sobre una tabla VACÍA (0 comprobantes emitidos), así que no hay
-- historial fiscal en riesgo y no hace falta backfill.

begin;

-- ── 1) Idempotencia ─────────────────────────────────────────────────────────

alter table public.electronic_invoices
  add column if not exists idempotency_key text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error_class text,
  add column if not exists last_error_message text;

comment on column public.electronic_invoices.idempotency_key is
  'business_id:ambiente:e-NCF:operación. Ver features/dgii/idempotency.ts — el formato lo construye SIEMPRE ese módulo.';
comment on column public.electronic_invoices.next_retry_at is
  'Cuándo lo volverá a intentar la cola. NULL = no hay reintento pendiente.';
comment on column public.electronic_invoices.last_error_class is
  'VALIDATION|AUTHENTICATION|NETWORK|TIMEOUT|DGII_REJECTION|CONFIGURATION|CERTIFICATE|INTERNAL';

-- LA barrera. Parcial porque un borrador todavía sin llave no compite con nada.
create unique index if not exists electronic_invoices_idempotency_key_uidx
  on public.electronic_invoices (idempotency_key)
  where idempotency_key is not null;

-- El mismo e-NCF no se puede gastar dos veces EN EL MISMO AMBIENTE. Que exista
-- en pruebas no debe estorbar a producción, por eso el ambiente entra en la
-- clave y no se compara solo el número.
create unique index if not exists electronic_invoices_encf_por_ambiente_uidx
  on public.electronic_invoices (business_id, ambiente, e_ncf)
  where e_ncf is not null and status <> 'cancelled';

-- Para que la cola encuentre lo que toca sin barrer la tabla.
create index if not exists electronic_invoices_pendientes_idx
  on public.electronic_invoices (business_id, next_retry_at)
  where next_retry_at is not null;

-- ── 2) Historial de eventos, append-only ────────────────────────────────────
--
-- El pliego (§8) lo pide y tiene razón: el estado de un documento fiscal no
-- puede ser solo la última columna escrita. Cuando algo sale mal, la pregunta
-- es «¿qué pasó y en qué orden?», y un `UPDATE status` no la contesta.

create table if not exists public.ecf_document_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  electronic_invoice_id uuid not null references public.electronic_invoices(id) on delete cascade,
  -- NULL en el primer evento: antes no había estado.
  status_from text,
  status_to text not null,
  -- `transition` | `retry_scheduled` | `error` | `note`
  event_type text not null default 'transition',
  error_class text,
  message text,
  -- Quién lo movió. NULL = lo movió un proceso, no una persona.
  actor_user_id uuid references public.users(id),
  /** Para atar este evento con la petición que lo provocó. */
  correlation_id text,
  created_at timestamptz not null default now()
);

comment on table public.ecf_document_events is
  'Historial APPEND-ONLY de un comprobante. No se actualiza ni se borra: si hiciera falta corregir algo, se añade otro evento.';

create index if not exists ecf_document_events_documento_idx
  on public.ecf_document_events (electronic_invoice_id, created_at);
create index if not exists ecf_document_events_business_idx
  on public.ecf_document_events (business_id, created_at desc);

-- Append-only DE VERDAD: sin esto, "append-only" es una intención escrita en un
-- comentario. Con esto, un UPDATE o un DELETE fallan aunque el que los lance
-- sea la clave de servicio.
create or replace function public.ecf_events_solo_insertar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ecf_document_events es append-only: no se actualiza ni se borra (intento de %)', tg_op;
end;
$$;

drop trigger if exists ecf_document_events_append_only on public.ecf_document_events;
create trigger ecf_document_events_append_only
  before update or delete on public.ecf_document_events
  for each row execute function public.ecf_events_solo_insertar();

-- ── 3) RLS ──────────────────────────────────────────────────────────────────
-- Mismo patrón que el resto: deny-by-default y aislamiento por negocio. La RLS
-- valida el `business_id`; el ROL lo valida `authorizeDgii` en la ruta (DL-01).

alter table public.ecf_document_events enable row level security;

drop policy if exists ecf_document_events_select on public.ecf_document_events;
create policy ecf_document_events_select
  on public.ecf_document_events for select
  using (
    business_id = ((select auth.jwt() -> 'app_metadata' ->> 'business_id'))::uuid
  );

-- Sin políticas de INSERT/UPDATE/DELETE para usuarios: los eventos los escribe
-- el servidor con service-role. Un cliente no tiene por qué poder escribir en
-- el historial fiscal.

commit;

notify pgrst, 'reload schema';
