-- supabase/migrations/20260906090200_dgii_fase2_funciones.sql
--
-- DGII fase 2, parte 3 de 3: las funciones y las dos claves foráneas recreadas.
--
-- `reserve_next_encf` es de agendapp, literal. `peek_next_encf`,
-- `prepare_ecf_invoice`, `finalize_ecf_invoice` y `fail_ecf_invoice` son nuevas:
-- agendapp hace todo eso dentro de una transacción de Prisma, y DermaLand no
-- abre transacciones desde el servidor web. Ver la sección «reservar por
-- comparación e intercambio» del plan y `docs/decisiones.md`.
--
-- SECURITY DEFINER + REVOKE, a diferencia de `emit_sale_atomic` que es INVOKER:
-- consumir un número fiscal no es una acción de cajero, y un `authenticated`
-- llamando a la RPC en bucle agotaría el rango autorizado por la DGII. El
-- business_id entra como parámetro y lo pone el servidor, nunca el navegador.

create or replace function reserve_next_encf(
  p_business_id uuid,
  p_tipo_ecf    text,
  p_ambiente    text
) returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_seq_id    uuid;
  v_next      bigint;
  v_range_end bigint;
  v_status    text;
  v_expires   timestamptz;
  v_encf      text;
begin
  if p_ambiente not in ('testecf','certecf','ecf') then
    raise exception 'reserve_next_encf: ambiente inválido %', p_ambiente using errcode = '22023';
  end if;
  if p_tipo_ecf not in ('31','32','33','34','41','42','43','44','45','46','47') then
    raise exception 'reserve_next_encf: tipo_ecf inválido %', p_tipo_ecf using errcode = '22023';
  end if;

  select id, next_number, range_end, status, expires_at
    into v_seq_id, v_next, v_range_end, v_status, v_expires
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = p_tipo_ecf
    and ambiente    = p_ambiente
    and status      = 'active'
  order by range_start asc
  for update
  limit 1;

  if v_seq_id is null then
    raise exception 'reserve_next_encf: no hay secuencia activa para business=% tipo=% ambiente=%',
      p_business_id, p_tipo_ecf, p_ambiente using errcode = 'P0002';
  end if;

  if v_expires is not null and v_expires < now() then
    update public.ecf_sequences set status = 'expired', updated_at = now() where id = v_seq_id;
    raise exception 'reserve_next_encf: secuencia vencida (id=%)', v_seq_id using errcode = 'P0003';
  end if;

  if v_next > v_range_end then
    update public.ecf_sequences set status = 'exhausted', updated_at = now() where id = v_seq_id;
    raise exception 'reserve_next_encf: rango agotado (id=%)', v_seq_id using errcode = 'P0004';
  end if;

  v_encf := 'E' || p_tipo_ecf || lpad(v_next::text, 10, '0');

  update public.ecf_sequences
     set next_number = v_next + 1,
         status      = case when v_next + 1 > v_range_end then 'exhausted' else status end,
         updated_at  = now()
   where id = v_seq_id;

  return v_encf;
end;
$$;

revoke execute on function reserve_next_encf(uuid, text, text) from public, anon, authenticated;
