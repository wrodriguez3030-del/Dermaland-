-- 0037_client_auth_links.sql
-- Puente entre la cuenta web de un cliente y su ficha comercial.
--
-- Por qué una tabla y no una columna en `clients`: un cliente del mostrador
-- existe sin cuenta web (es el caso normal), y una cuenta web puede existir
-- antes de que nadie le abra ficha. Son dos ciclos de vida distintos.
--
-- Por qué NO va en el token: `app_metadata.business_id` es la marca de que
-- alguien es PERSONAL del negocio, y el middleware la usa para decidir el acceso
-- al ERP. Meter ahí un `client_id` mezclaría "quién eres" con "qué puedes", que
-- es exactamente la confusión que abre agujeros.
--
-- Idempotente de principio a fin: el historial de migraciones de este proyecto
-- no es fiable y se verifica por objeto (R-WEB-04).

create table if not exists public.client_auth_links (
  -- Una cuenta de Supabase = un cliente. Si se borra la cuenta se borra el
  -- vínculo, nunca la ficha comercial ni su historial de compras.
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- Un cliente no puede tener dos cuentas web en el mismo negocio.
create unique index if not exists client_auth_links_cliente_unico
  on public.client_auth_links (business_id, client_id);

create index if not exists client_auth_links_business_idx
  on public.client_auth_links (business_id);

alter table public.client_auth_links enable row level security;

-- Deny-by-default: sin políticas nadie lee ni escribe. Se añade EXACTAMENTE
-- una, de lectura, y sólo sobre la fila propia.
drop policy if exists client_auth_links_propia on public.client_auth_links;
create policy client_auth_links_propia
  on public.client_auth_links
  for select
  using (auth_user_id = auth.uid());

-- El alta la hace el servidor con service_role (que salta RLS). Que un cliente
-- pudiera insertar aquí sería dejarle elegir a qué ficha comercial se engancha,
-- y con ella al historial de compras de otra persona.
revoke insert, update, delete on public.client_auth_links from anon, authenticated;

notify pgrst, 'reload schema';
