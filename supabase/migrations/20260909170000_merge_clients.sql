-- Unificar clientes (diseño aprobado 09/09/2026,
-- docs/superpowers/specs/2026-09-09-unificar-clientes-design.md).
--
-- `merge_clients` fusiona `p_duplicate_id` DENTRO de `p_primary_id`: reasigna
-- las 7 tablas con FK a `clients`, rellena los huecos del sobreviviente con
-- los datos del duplicado (coalesce, NUNCA sobreescribe lo que ya tenía) y
-- deja el duplicado con `deleted_at` (mismo soft-delete que "Eliminar
-- cliente" — no se borra físicamente).
--
-- SECURITY INVOKER (mismo patrón que emit_sale_atomic/void_sale_atomic,
-- 0029): corre con privilegios del invocador, RLS aplica, el tenant sale de
-- `auth_business_id()` (JWT), nunca de un parámetro. `search_path` fijado
-- desde el día uno (mismo endurecimiento que 0035_dl14_function_search_path).
--
-- Ninguna de las 7 columnas reasignadas tiene índice único (verificado
-- contra la base real 09/09/2026: solo hay uniques compuestos sobre OTRAS
-- columnas de esas tablas) — reasignar en bloque no puede chocar con
-- unique_violation.
create or replace function public.merge_clients(
  p_primary_id uuid,
  p_duplicate_id uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_biz uuid := auth_business_id();
  v_primary public.clients%rowtype;
  v_duplicate public.clients%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;
  if p_primary_id = p_duplicate_id then
    raise exception 'No se puede unificar un cliente consigo mismo' using errcode = 'P0003';
  end if;

  select * into v_primary from public.clients
    where id = p_primary_id and business_id = v_biz and deleted_at is null
    for update;
  if not found then
    raise exception 'Cliente sobreviviente no encontrado o no pertenece al negocio' using errcode = 'P0002';
  end if;

  select * into v_duplicate from public.clients
    where id = p_duplicate_id and business_id = v_biz and deleted_at is null
    for update;
  if not found then
    raise exception 'Cliente duplicado no encontrado, no pertenece al negocio o ya fue unificado' using errcode = 'P0002';
  end if;

  update public.alegra_invoices set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('alegra_invoices', v_n);

  update public.ar_promises set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('ar_promises', v_n);

  update public.client_auth_links set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('client_auth_links', v_n);

  update public.electronic_invoices set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('electronic_invoices', v_n);

  update public.electronic_invoices_legacy_20260906 set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('electronic_invoices_legacy_20260906', v_n);

  update public.proformas set customer_id = p_primary_id
    where customer_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('proformas', v_n);

  update public.web_orders set client_id = p_primary_id
    where client_id = p_duplicate_id and business_id = v_biz;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('web_orders', v_n);

  -- Rellenar huecos del sobreviviente con el duplicado — nunca sobreescribe.
  -- Documento y tipo de documento viajan JUNTOS (un tipo no debe quedar
  -- huérfano de un número que vino de la otra ficha).
  update public.clients set
    phone = coalesce(v_primary.phone, v_duplicate.phone),
    whatsapp = coalesce(v_primary.whatsapp, v_duplicate.whatsapp),
    email = coalesce(v_primary.email, v_duplicate.email),
    birth_date = coalesce(v_primary.birth_date, v_duplicate.birth_date),
    address = coalesce(v_primary.address, v_duplicate.address),
    document_number = coalesce(v_primary.document_number, v_duplicate.document_number),
    document_type = case
      when v_primary.document_number is null then coalesce(v_primary.document_type, v_duplicate.document_type)
      else v_primary.document_type
    end,
    updated_at = now()
  where id = p_primary_id and business_id = v_biz;

  update public.clients set deleted_at = now(), updated_at = now()
    where id = p_duplicate_id and business_id = v_biz;

  return jsonb_build_object(
    'primaryId', p_primary_id,
    'duplicateId', p_duplicate_id,
    'moved', v_moved
  );
end;
$$;

notify pgrst, 'reload schema';
