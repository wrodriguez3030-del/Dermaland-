-- El número de proforma se decidía en el NAVEGADOR.
--
-- `reserveNextPreferredAnywhere` reserva en servidor los comprobantes fiscales,
-- pero excluye la proforma a propósito: «no consume secuencia fiscal». Eso es
-- cierto fiscalmente, pero de ahí no se sigue que el número pueda salir del
-- `localStorage`: la tabla tiene un índice único (business_id, number) y dos
-- equipos con contadores distintos chocan.
--
-- Y chocaron: PROF-2026-000195 se emitió el 8 de agosto y PROF-2026-000190 el
-- 10 — un equipo iba por detrás. Cuando el de atrás alcance al de delante, el
-- insert falla con 23505 y el cajero lee «Ya existe un registro con esos datos»
-- justo al cobrar, sin saber qué dato ni qué hacer.
--
-- El contador vive aquí porque es el único sitio donde la unicidad se puede
-- garantizar: `update ... returning` es atómico y serializa a los concurrentes.

create table if not exists public.proforma_counters (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  year        int    not null,
  next_value  bigint not null,
  updated_at  timestamptz not null default now()
);

alter table public.proforma_counters enable row level security;

-- Sin políticas: deny-by-default. Sólo se toca con service-role a través de la
-- función de abajo, que es `security definer`. Ningún cliente lee ni escribe
-- este contador directamente.

comment on table public.proforma_counters is
  'Contador de proformas por negocio. Reemplaza la numeración que vivía en el localStorage del cajero.';

create or replace function public.next_proforma_number(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year  int := extract(year from now())::int;
  v_value bigint;
begin
  if p_business_id is null then
    raise exception 'business_id es obligatorio';
  end if;

  -- Siembra desde el máximo que ya existe, para no repetir un número emitido
  -- por la numeración vieja del navegador. Los 6 dígitos con relleno de ceros
  -- importan: los números legados sin relleno (PROF-2026-89236) nunca colisionan
  -- con estos porque son cadenas distintas.
  insert into public.proforma_counters (business_id, year, next_value)
  values (
    p_business_id,
    v_year,
    coalesce(
      (select max(substring(number from 11)::bigint) + 1
         from public.proformas
        where business_id = p_business_id
          and number ~ ('^PROF-' || v_year::text || '-[0-9]{6}$')),
      1
    )
  )
  on conflict (business_id) do nothing;

  -- Al cambiar de año la cuenta vuelve a 1: el año va en el número, así que
  -- PROF-2026-000001 y PROF-2027-000001 son distintos.
  update public.proforma_counters
     set next_value = case when year = v_year then next_value + 1 else 2 end,
         year       = v_year,
         updated_at = now()
   where business_id = p_business_id
  returning case when year = v_year and next_value > 1 then next_value - 1 else 1 end
      into v_value;

  return 'PROF-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
end;
$$;

revoke all on function public.next_proforma_number(uuid) from public, anon, authenticated;

comment on function public.next_proforma_number(uuid) is
  'Reserva atómica del siguiente número de proforma. Sólo service-role: el cliente lo pide por /api/proformas/next-number.';

notify pgrst, 'reload schema';
