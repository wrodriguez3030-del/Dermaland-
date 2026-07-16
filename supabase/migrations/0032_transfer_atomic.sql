-- =============================================================================
-- DermaLand · Transferencia de stock ATÓMICA entre sucursales
-- =============================================================================
-- No destructiva: solo CREATE OR REPLACE FUNCTION. Las tablas inventory_transfers
-- e inventory_transfer_items ya existen (mig 0010) y transfer_out/transfer_in ya
-- son tipos válidos de inventory_movements (mig 0002).
--
-- Descuenta del lote origen y crea/suma el lote destino (conservando número de
-- lote y vencimiento), registra la cabecera + ítems + dos movimientos
-- (transfer_out/transfer_in) con la misma referencia. Todo en UNA transacción.
-- SECURITY INVOKER (por defecto) → RLS aplica; el tenant sale de auth_business_id().
--
-- p_header: { transfer_number, origin_warehouse_id, destination_branch_id,
--             destination_warehouse_id, transfer_date, notes, created_by_name }
-- p_items:  [ { lot_id, qty } ]
create or replace function public.transfer_stock_atomic(
  p_header jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_biz uuid := auth_business_id();
  v_user uuid := auth.uid();
  v_user_name text := p_header->>'created_by_name';
  v_transfer_id uuid;
  v_number text := p_header->>'transfer_number';
  v_dest_branch uuid := (p_header->>'destination_branch_id')::uuid;
  v_dest_wh uuid := (p_header->>'destination_warehouse_id')::uuid;
  v_origin_wh uuid := (p_header->>'origin_warehouse_id')::uuid;
  v_date date := coalesce((p_header->>'transfer_date')::date, current_date);
  v_notes text := p_header->>'notes';
  v_it jsonb;
  v_qty int;
  v_lot public.product_lots%rowtype;
  v_dest_lot_id uuid;
  v_total int := 0;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;
  if v_number is null or v_number = '' then
    raise exception 'Falta transfer_number' using errcode = 'P0001';
  end if;
  if v_dest_wh = v_origin_wh then
    raise exception 'Origen y destino no pueden ser el mismo almacén' using errcode = 'P0001';
  end if;

  insert into public.inventory_transfers (
    business_id, transfer_number, origin_warehouse_id, destination_warehouse_id,
    transfer_date, notes, status, created_by
  ) values (
    v_biz, v_number, v_origin_wh, v_dest_wh, v_date, v_notes, 'completed', v_user
  ) returning id into v_transfer_id;

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;

    -- Descontar del lote origen (guarda de stock atómica).
    update public.product_lots
      set current_quantity = current_quantity - v_qty, updated_at = now()
      where id = (v_it->>'lot_id')::uuid
        and business_id = v_biz
        and status = 'available'
        and current_quantity >= v_qty
      returning * into v_lot;
    if not found then
      raise exception 'STOCK_INSUFICIENTE: lote % (se pidió %)', v_it->>'lot_id', v_qty
        using errcode = 'P0001';
    end if;

    -- Crear/sumar el lote destino (respeta unique(business,product,lot_number,warehouse)).
    select id into v_dest_lot_id
      from public.product_lots
      where business_id = v_biz and product_id = v_lot.product_id
        and lot_number = v_lot.lot_number and warehouse_id = v_dest_wh
      for update;
    if found then
      update public.product_lots
        set current_quantity = current_quantity + v_qty, updated_at = now()
        where id = v_dest_lot_id;
    else
      insert into public.product_lots (
        business_id, branch_id, product_id, warehouse_id, lot_number,
        manufactured_at, expires_at, received_at, initial_quantity,
        current_quantity, unit_cost, status, notes
      ) values (
        v_biz, v_dest_branch, v_lot.product_id, v_dest_wh, v_lot.lot_number,
        v_lot.manufactured_at, v_lot.expires_at, now(), v_qty,
        v_qty, v_lot.unit_cost, 'available', 'Transferencia ' || v_number
      ) returning id into v_dest_lot_id;
    end if;

    insert into public.inventory_transfer_items (
      business_id, transfer_id, product_id, lot_id, quantity, unit_cost, expiration_date
    ) values (
      v_biz, v_transfer_id, v_lot.product_id, v_lot.id, v_qty, v_lot.unit_cost, v_lot.expires_at
    );

    -- Movimientos en pareja (misma referencia = número de transferencia).
    insert into public.inventory_movements (
      business_id, branch_id, product_id, warehouse_id, lot_id,
      type, quantity, reason, reference, user_id, user_name
    ) values
      (v_biz, v_lot.branch_id, v_lot.product_id, v_lot.warehouse_id, v_lot.id,
       'transfer_out', -v_qty, coalesce(v_notes, 'Transferencia entre sucursales'),
       v_number, v_user, v_user_name),
      (v_biz, v_dest_branch, v_lot.product_id, v_dest_wh, v_dest_lot_id,
       'transfer_in', v_qty, coalesce(v_notes, 'Transferencia entre sucursales'),
       v_number, v_user, v_user_name);

    v_total := v_total + v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'La transferencia no tiene ítems con cantidad > 0' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_transfer_id, 'transfer_number', v_number, 'total', v_total);
end;
$$;

notify pgrst, 'reload schema';
