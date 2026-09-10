-- Número de cuenta por tenant: un entero corto, autogenerado y secuencial,
-- para identificar cada negocio de la plataforma (soporte, facturación entre
-- tenants) sin exponer el UUID interno.
--
-- Arranca en 1001 — no en 1 — para que se lea como un número de cuenta real
-- desde el primer negocio, no como un índice de array. DermaLand, al ser el
-- negocio más antiguo (`created_at` 2026-05-19), se queda con el 1001; el
-- tenant de prueba (CNTTEST, creado después) con el 1002.
--
-- 🔴 SIN APLICAR: esta tarea no toca la base en vivo. La aplica el dueño.

create sequence if not exists public.businesses_account_number_seq
  start with 1001
  increment by 1
  owned by none;

alter table public.businesses
  add column if not exists account_number integer;

-- Backfill por orden de alta: cada negocio existente toma el siguiente valor
-- de la secuencia, en el mismo orden en que se dieron de alta.
update public.businesses b
set account_number = s.numero
from (
  select id, nextval('public.businesses_account_number_seq') as numero
  from public.businesses
  order by created_at
) as s
where s.id = b.id
  and b.account_number is null;

alter table public.businesses
  alter column account_number set default nextval('public.businesses_account_number_seq'),
  alter column account_number set not null,
  add constraint businesses_account_number_key unique (account_number);

alter sequence public.businesses_account_number_seq owned by public.businesses.account_number;

comment on column public.businesses.account_number is
  'Número de cuenta del tenant — entero corto, autogenerado y secuencial (arranca en 1001). Identifica al negocio de cara al soporte/facturación entre tenants, sin exponer el UUID interno.';

notify pgrst, 'reload schema';
