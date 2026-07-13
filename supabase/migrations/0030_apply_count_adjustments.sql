-- B-05b (Fase 3b): al APROBAR un conteo físico, ajustar el stock real de los
-- lotes según las diferencias encontradas, todo ATÓMICO e idempotente.
--
-- Regla: se aplica el DELTA (`difference_quantity` = contado − esperado, snapshot
-- al momento del conteo), NO el valor absoluto contado. Así se respeta cualquier
-- venta/movimiento legítimo ocurrido entre el conteo y la aprobación. El stock
-- nunca baja de 0 (se clampa) y el movimiento `count_adjustment` registra el
-- cambio REAL aplicado (auditoría).
--
-- Seguridad: SECURITY INVOKER → RLS aplica; tenant desde `auth_business_id()`.
-- Idempotente: si el conteo ya está approved/adjusted, no reajusta.

create or replace function public.apply_count_adjustments(p_count_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_biz uuid := auth_business_id();
  v_status text;
  v_number text;
  it record;
  v_before int;
  v_branch uuid;
  v_new int;
  v_delta int;
  v_applied int := 0;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;

  -- Bloquear el conteo del tenant (evita doble aprobación por carrera).
  select status, count_number into v_status, v_number
    from public.inventory_counts
    where id = p_count_id and business_id = v_biz
    for update;
  if not found then
    raise exception 'Conteo no encontrado o no pertenece al negocio' using errcode = 'P0002';
  end if;

  -- Idempotencia: si ya se aprobó/ajustó, no volver a tocar el stock.
  if v_status in ('approved', 'adjusted') then
    return jsonb_build_object('count_id', p_count_id, 'already', true, 'adjusted', 0);
  end if;

  update public.inventory_counts
    set status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
    where id = p_count_id and business_id = v_biz;

  -- Ajustar cada ítem con lote y diferencia distinta de 0.
  for it in
    select product_lot_id, product_id, warehouse_id,
           coalesce(difference_quantity, counted_quantity - expected_quantity) as delta
    from public.inventory_count_items
    where inventory_count_id = p_count_id and business_id = v_biz
      and product_lot_id is not null
  loop
    v_delta := it.delta;
    if v_delta is null or v_delta = 0 then continue; end if;

    select current_quantity, branch_id into v_before, v_branch
      from public.product_lots
      where id = it.product_lot_id and business_id = v_biz
      for update;
    if not found then continue; end if;

    -- Nunca por debajo de 0 (respeta el CHECK B-06). El movimiento registra el
    -- delta REAL aplicado (v_new - v_before), que puede diferir del teórico si
    -- el clamp actuó.
    v_new := greatest(0, v_before + v_delta);
    if v_new = v_before then continue; end if;

    update public.product_lots
      set current_quantity = v_new, updated_at = now()
      where id = it.product_lot_id and business_id = v_biz;

    insert into public.inventory_movements (
      business_id, branch_id, product_id, warehouse_id, lot_id,
      type, quantity, reason, user_id
    ) values (
      v_biz, v_branch, it.product_id, it.warehouse_id, it.product_lot_id,
      'count_adjustment', v_new - v_before,
      'Ajuste por conteo ' || coalesce(v_number, p_count_id::text),
      auth.uid()
    );
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('count_id', p_count_id, 'already', false, 'adjusted', v_applied);
end;
$$;
