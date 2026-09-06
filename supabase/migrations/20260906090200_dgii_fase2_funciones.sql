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
--
-- ALCANCE REAL DE ESE REVOKE, para que nadie lea de más: protege el cruce ENTRE
-- empresas. Dentro de una, no protege nada — cualquier usuario autenticado de
-- esa misma empresa puede hacer `PATCH /rest/v1/ecf_sequences` y retroceder
-- `next_number` sin tocar ninguna función, porque la política de `ecf_sequences`
-- es `for all using (business_id = auth_business_id())`. No es una regresión de
-- esta rama (`0003_dgii_pos.sql:150` ya la tenía, y agendapp también), pero el
-- patrón de la casa para un contador que solo debe tocar el servidor es el
-- contrario: `proforma_counters` tiene RLS y CERO políticas
-- (`20260810040000_proforma_number_server_side.sql:24-28`). Queda escrito para
-- la fase 4, que va a construir encima. I6 de la revisión final.
--
-- Y CADA REVOKE LLEVA SU GRANT A `service_role`. Estas migraciones revocan
-- también de `public`, a diferencia del precedente de la casa
-- (`0038_web_orders.sql:120`, que revoca solo de anon y authenticated). Si
-- `service_role` tuviera EXECUTE únicamente heredado de PUBLIC, el revoke se lo
-- quitaría y la fase 3 se estrellaría con «permission denied for function» sin
-- aviso previo. Comprobado contra un Postgres 16 efímero: sin el grant,
-- `has_function_privilege('service_role', …, 'execute')` da FALSE en las cinco.
-- En Supabase normalmente lo salvan los default privileges del proyecto, pero
-- eso es una suposición sobre la base, no algo que este fichero garantice.
-- Concederlo explícitamente no afloja nada: `service_role` es la clave del
-- servidor, que ya se salta la RLS entera.

-- ── 0) Guarda de orden: partes 1 y 2 aplicadas ───────────────────────────────
-- I2 de la revisión final. `create or replace function` NO valida las
-- referencias a columnas del cuerpo plpgsql, así que esta migración se aplica
-- «con éxito» sobre cualquier esquema. Sin la guarda: si falta la parte 1, las
-- dos claves foráneas del final se enganchan a la `electronic_invoices` VIEJA
-- sin que nadie se entere; si falta la parte 2, `reserve_next_encf` revienta en
-- ejecución al leer `expires_at`, que la `ecf_sequences` vieja no tiene
-- (`0003_dgii_pos.sql:131` la llama `fecha_vencimiento`).
do $$
begin
  if to_regclass('public.electronic_invoices_legacy_20260906') is null then
    raise exception 'DGII fase 2: falta aplicar la parte 1 (retirada). Aplícala antes que esta.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ecf_sequences' and column_name = 'expires_at'
  ) then
    raise exception 'DGII fase 2: falta aplicar la parte 2 (tablas). Aplícala antes que esta.';
  end if;
end $$;

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
grant execute on function reserve_next_encf(uuid, text, text) to service_role;

-- ── peek_next_encf: qué número tocaría, sin consumir ni bloquear ─────────────
-- La aplicación firma el XML con este número. Si entre el peek y el prepare
-- otro cobro se lo lleva, `prepare_ecf_invoice` lo detecta y devuelve
-- ENCF_TOMADO; entonces se vuelve a firmar. Firmar cuesta milisegundos de CPU
-- local; quemar un número fiscal cuesta un trámite ante la DGII.
create or replace function public.peek_next_encf(
  p_business_id uuid,
  p_tipo_ecf    text,
  p_ambiente    text
) returns text
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  v_next bigint;
begin
  select next_number into v_next
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = p_tipo_ecf
    and ambiente    = p_ambiente
    and status      = 'active'
    and next_number <= range_end
    and (expires_at is null or expires_at >= now())
  order by range_start asc
  limit 1;

  if v_next is null then
    raise exception 'peek_next_encf: no hay secuencia utilizable para business=% tipo=% ambiente=%',
      p_business_id, p_tipo_ecf, p_ambiente using errcode = 'P0002';
  end if;

  return 'E' || p_tipo_ecf || lpad(v_next::text, 10, '0');
end;
$$;

revoke execute on function public.peek_next_encf(uuid, text, text) from public, anon, authenticated;
grant execute on function public.peek_next_encf(uuid, text, text) to service_role;

-- ── prepare_ecf_invoice: consume el número e inserta la factura, atómico ─────
-- p_factura: {tipo_ecf, ambiente, proforma_id, customer_id, customer_rnc,
--             subtotal_gravado, total_itbis, total, xml_generated_path}
-- p_items:   [{line_no, name_item, quantity, unit_price, itbis_rate, monto_item}, …]
create or replace function public.prepare_ecf_invoice(
  p_business_id   uuid,
  p_expected_encf text,
  p_factura       jsonb,
  p_items         jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_tipo      text := p_factura->>'tipo_ecf';
  v_ambiente  text := p_factura->>'ambiente';
  v_proforma  uuid := nullif(p_factura->>'proforma_id', '')::uuid;
  v_next      bigint;
  v_range_end bigint;
  v_actual    text;
  v_encf      text;
  v_seq_id    uuid;
  v_encf_num  bigint;
  v_invoice   uuid;
  v_ya        uuid;
  it          jsonb;
begin
  -- 1) Idempotencia. Se bloquea la proforma y se re-comprueba DENTRO de la
  --    transacción: sin esto, dos cobros a la vez de la misma proforma sacaban
  --    dos comprobantes con dos números.
  if v_proforma is not null then
    select electronic_invoice_id into v_ya
    from public.proformas
    where id = v_proforma and business_id = p_business_id
    for update;
    if v_ya is not null then
      return jsonb_build_object('ok', false, 'motivo', 'IDEMPOTENT_PROFORMA_YA_FACTURADA',
                                'invoice_id', v_ya);
    end if;
  end if;

  -- 2) Bloquear la secuencia y traer next_number Y range_end en el mismo
  --    SELECT ... FOR UPDATE. range_end viaja aquí porque, bajo el mismo
  --    bloqueo, hace falta saber si next_number sigue dentro de rango antes
  --    de construir un e-NCF "esperado" con él.
  --
  --    Adrede NO se levanta ninguna excepción aquí, ni cuando no aparece
  --    ninguna fila (v_seq_id/v_next quedan NULL) ni cuando la secuencia
  --    está agotada pero todavía marcada 'active' (v_next > v_range_end):
  --    las dos cosas hacen que la comparación de abajo (`v_next <=
  --    v_range_end`) dé NULL o falso y el `if` se salte solo, cayendo al
  --    camino normal. reserve_next_encf, más abajo, vuelve a leer la misma
  --    fila y es la única con la lógica de qué error corresponde en cada
  --    caso (P0002 sin secuencia, P0003 vencida, P0004 agotada) — duplicarla
  --    aquí sólo podía desincronizarse con ella. Sin esto, además, un
  --    e-NCF "esperado" fuera de rango habría devuelto ENCF_TOMADO con un
  --    e_ncf_actual que no existe: un motivo confuso para algo que en
  --    realidad es una secuencia agotada.
  select id, next_number, range_end into v_seq_id, v_next, v_range_end
  from public.ecf_sequences
  where business_id = p_business_id
    and tipo_ecf    = v_tipo
    and ambiente    = v_ambiente
    and status      = 'active'
  order by range_start asc
  for update
  limit 1;

  if v_next <= v_range_end then
    v_actual := 'E' || v_tipo || lpad(v_next::text, 10, '0');
    if v_actual is distinct from p_expected_encf then
      -- Otro cobro se adelantó. No se consume nada: la aplicación vuelve a firmar
      -- con `e_ncf_actual` y llama otra vez. Es un no, no un error.
      return jsonb_build_object('ok', false, 'motivo', 'ENCF_TOMADO', 'e_ncf_actual', v_actual);
    end if;
  end if;

  -- 3) Ahora sí, consumir. Reusa la función portada: una sola implementación
  --    del incremento, la que agendapp lleva meses corriendo en producción.
  v_encf := public.reserve_next_encf(p_business_id, v_tipo, v_ambiente);
  v_encf_num := (substring(v_encf from 4))::bigint;

  select id into v_seq_id
  from public.ecf_sequences
  where business_id = p_business_id and tipo_ecf = v_tipo and ambiente = v_ambiente
    and range_start <= v_encf_num and range_end >= v_encf_num
  limit 1;

  -- 4) La factura nace en `draft`: todavía no está firmada.
  insert into public.electronic_invoices (
    business_id, tipo_ecf, e_ncf, secuencia_id, status, ambiente,
    customer_id, customer_rnc, subtotal_gravado, total_itbis, total,
    xml_generated_path, generated_at
  ) values (
    p_business_id, v_tipo, v_encf, v_seq_id, 'draft', v_ambiente,
    nullif(p_factura->>'customer_id','')::uuid,
    nullif(p_factura->>'customer_rnc',''),
    coalesce((p_factura->>'subtotal_gravado')::numeric, 0),
    coalesce((p_factura->>'total_itbis')::numeric, 0),
    coalesce((p_factura->>'total')::numeric, 0),
    nullif(p_factura->>'xml_generated_path',''),
    now()
  ) returning id into v_invoice;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.electronic_invoice_items (
      business_id, electronic_invoice_id, line_no, name_item,
      quantity, unit_price, itbis_rate, monto_item
    ) values (
      p_business_id, v_invoice,
      (it->>'line_no')::int, it->>'name_item',
      coalesce((it->>'quantity')::numeric, 1),
      (it->>'unit_price')::numeric,
      coalesce((it->>'itbis_rate')::numeric, 0),
      (it->>'monto_item')::numeric
    );
  end loop;

  if v_proforma is not null then
    update public.proformas set electronic_invoice_id = v_invoice
    where id = v_proforma and business_id = p_business_id;
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice, 'e_ncf', v_encf);
end;
$$;

revoke execute on function public.prepare_ecf_invoice(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_ecf_invoice(uuid, text, jsonb, jsonb) to service_role;

-- ── finalize_ecf_invoice: la firma ya está hecha y subida ────────────────────
-- p_datos: {xml_signed_path, xml_sha256, security_code}
create or replace function public.finalize_ecf_invoice(
  p_business_id uuid,
  p_invoice_id  uuid,
  p_datos       jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_filas int;
begin
  update public.electronic_invoices
     set status          = 'signed',
         xml_signed_path = nullif(p_datos->>'xml_signed_path',''),
         signed_at       = now(),
         updated_at      = now()
   where id = p_invoice_id
     and business_id = p_business_id
     and status = 'draft';
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    -- O no es nuestra, o ya no estaba en draft. Las dos cosas son un no.
    return jsonb_build_object('ok', false, 'motivo', 'NO_ESTABA_EN_DRAFT');
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id);
end;
$$;

revoke execute on function public.finalize_ecf_invoice(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_ecf_invoice(uuid, uuid, jsonb) to service_role;

-- ── fail_ecf_invoice: falló después de consumir el número ────────────────────
-- El número queda gastado, pero con nombre y motivo. Un número gastado que nadie
-- puede explicar es lo que hay que evitar: la DGII pregunta por el rango entero.
-- Por eso el UPDATE comprueba su propio row_count (igual que finalize_ecf_invoice
-- arriba): si no tocó ninguna fila —invoice_id de otra empresa, o que no
-- existe— NO puede devolver éxito. Un {"ok":true} falso aquí es exactamente el
-- escenario que esta función debía impedir: la factura real se queda sin
-- motivo y el número ya consumido queda sin nadie que lo explique.
create or replace function public.fail_ecf_invoice(
  p_business_id uuid,
  p_invoice_id  uuid,
  p_motivo      text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_filas int;
begin
  update public.electronic_invoices
     set status              = 'error',
         dgii_status_message = left(coalesce(p_motivo, 'sin motivo'), 500),
         updated_at          = now()
   where id = p_invoice_id and business_id = p_business_id;
  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    -- O no es nuestra, o no existe. Las dos cosas son un no, y a propósito no
    -- se distinguen: decir "no es tuya" a quien pasa un invoice_id de otra
    -- empresa le estaría confirmando que ese id existe. Mismo criterio que
    -- finalize_ecf_invoice.
    return jsonb_build_object('ok', false, 'motivo', 'FACTURA_NO_ENCONTRADA');
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', p_invoice_id);
end;
$$;

revoke execute on function public.fail_ecf_invoice(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_ecf_invoice(uuid, uuid, text) to service_role;

-- ── Las dos claves foráneas, ahora apuntando a la tabla nueva ────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proformas_electronic_invoice_fk') then
    alter table public.proformas
      add constraint proformas_electronic_invoice_fk
      foreign key (electronic_invoice_id) references public.electronic_invoices(id)
      on delete set null deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cash_closing_sales_electronic_invoice_fk') then
    alter table public.cash_closing_sales
      add constraint cash_closing_sales_electronic_invoice_fk
      foreign key (electronic_invoice_id) references public.electronic_invoices(id)
      on delete set null deferrable initially deferred;
  end if;
end $$;

-- Cinco RPC nuevas: PostgREST tiene que enterarse. M4 de la revisión final.
notify pgrst, 'reload schema';
