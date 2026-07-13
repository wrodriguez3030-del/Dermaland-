-- B-02 y B-03 (validación de producción): emisión y anulación de venta ATÓMICAS.
--
-- B-02: hoy el POS crea la venta y LUEGO descuenta el stock en llamadas separadas
--       (sin transacción). Si el descuento falla, la venta queda sin descontar.
--       `emit_sale_atomic` hace venta + ítems + pagos + descuento de lotes en UNA
--       transacción (función plpgsql). Si cualquier lote no tiene stock suficiente,
--       RAISE → rollback total → no queda venta ni descuento parcial.
--
-- B-03: hoy anular una venta solo cambia el estado; NO reingresa el stock.
--       `void_sale_atomic` revierte los movimientos `exit_sale` REALES de la venta
--       (por `proforma_id`, no por el lote del ítem — que puede diferir por FEFO),
--       reingresa el stock y registra movimientos `return_in`, todo atómico e
--       idempotente (si ya está anulada, no reingresa dos veces).
--
-- Seguridad: ambas funciones son SECURITY INVOKER (corren como el usuario) → RLS
-- aplica; el tenant sale de `auth_business_id()` (JWT), nunca del cliente. No pueden
-- tocar datos de otra empresa (WITH CHECK de las políticas ALL por business_id).

-- ── Enlace movimiento → venta (para revertir con precisión en la anulación) ──
alter table public.inventory_movements
  add column if not exists proforma_id uuid references public.proformas(id) on delete set null;

create index if not exists inventory_movements_proforma_idx
  on public.inventory_movements (business_id, proforma_id)
  where proforma_id is not null;

-- ── B-02: emisión atómica ───────────────────────────────────────────────────
create or replace function public.emit_sale_atomic(
  p_sale jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_decrements jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_biz uuid := auth_business_id();
  v_idem text := nullif(p_sale->>'idempotency_key', '');
  v_cashier uuid := nullif(p_sale->>'cashier_id', '')::uuid;
  v_cashier_name text := p_sale->>'cashier_name';
  v_pid uuid;
  v_existing uuid;
  d jsonb;
  v_qty int;
  v_lot public.product_lots%rowtype;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;

  -- Idempotencia (SEC-011): si ya existe una venta con esta clave, devolverla.
  if v_idem is not null then
    select id into v_existing from public.proformas
      where business_id = v_biz and idempotency_key = v_idem limit 1;
    if v_existing is not null then
      return jsonb_build_object('id', v_existing, 'reused', true);
    end if;
  end if;

  -- 1) Venta (columnas explícitas → respeta defaults de id/created_at/updated_at).
  insert into public.proformas (
    business_id, branch_id, number, customer_id, customer_name,
    cashier_id, cashier_name, subtotal, discount, itbis, total, status,
    paid, balance, notes, ecf_number, cash_register_session_id,
    discount_percent, discount_amount, billing_type, customer_phone,
    customer_document, amount_received, change_amount, document_kind,
    ecf_type, sequence_type, numbering_id, sequence_environment,
    seller_id, seller_name, source_proforma_id, idempotency_key
  ) values (
    v_biz,
    (p_sale->>'branch_id')::uuid,
    p_sale->>'number',
    nullif(p_sale->>'customer_id','')::uuid,
    p_sale->>'customer_name',
    v_cashier,
    v_cashier_name,
    coalesce((p_sale->>'subtotal')::numeric, 0),
    coalesce((p_sale->>'discount')::numeric, 0),
    coalesce((p_sale->>'itbis')::numeric, 0),
    coalesce((p_sale->>'total')::numeric, 0),
    coalesce(p_sale->>'status', 'issued'),
    coalesce((p_sale->>'paid')::numeric, 0),
    coalesce((p_sale->>'balance')::numeric, 0),
    p_sale->>'notes',
    p_sale->>'ecf_number',
    nullif(p_sale->>'cash_register_session_id','')::uuid,
    (p_sale->>'discount_percent')::numeric,
    (p_sale->>'discount_amount')::numeric,
    p_sale->>'billing_type',
    p_sale->>'customer_phone',
    p_sale->>'customer_document',
    (p_sale->>'amount_received')::numeric,
    (p_sale->>'change_amount')::numeric,
    coalesce(p_sale->>'document_kind', 'proforma'),
    p_sale->>'ecf_type',
    p_sale->>'sequence_type',
    nullif(p_sale->>'numbering_id','')::uuid,
    p_sale->>'sequence_environment',
    nullif(p_sale->>'seller_id','')::uuid,
    p_sale->>'seller_name',
    nullif(p_sale->>'source_proforma_id','')::uuid,
    v_idem
  ) returning id into v_pid;

  -- 2) Ítems (montos ya recalculados en el servidor, SEC-002).
  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    insert into public.proforma_items (
      business_id, proforma_id, line_no, product_id, product_sku,
      product_name, product_lot_id, lot_number, quantity, unit_price,
      itbis_rate, discount, subtotal, itbis, total, kind
    )
    select
      v_biz, v_pid,
      coalesce((x->>'line_no')::int, ord::int),
      nullif(x->>'product_id','')::uuid,
      x->>'product_sku',
      x->>'product_name',
      nullif(x->>'product_lot_id','')::uuid,
      x->>'lot_number',
      (x->>'quantity')::numeric,
      (x->>'unit_price')::numeric,
      coalesce((x->>'itbis_rate')::numeric, 0),
      coalesce((x->>'discount')::numeric, 0),
      (x->>'subtotal')::numeric,
      coalesce((x->>'itbis')::numeric, 0),
      (x->>'total')::numeric,
      coalesce(x->>'kind', 'bien')
    from jsonb_array_elements(p_items) with ordinality as t(x, ord);
  end if;

  -- 3) Pagos.
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' and jsonb_array_length(p_payments) > 0 then
    insert into public.proforma_payments (
      business_id, proforma_id, method_code, amount, reference, user_id, user_name
    )
    select
      v_biz, v_pid,
      x->>'method_code',
      (x->>'amount')::numeric,
      x->>'reference',
      coalesce(nullif(x->>'user_id','')::uuid, v_cashier),
      coalesce(x->>'user_name', v_cashier_name)
    from jsonb_array_elements(p_payments) as x;
  end if;

  -- 4) Descuento de inventario ATÓMICO (guarda `>= qty`) + movimiento exit_sale.
  if p_decrements is not null and jsonb_typeof(p_decrements) = 'array' then
    for d in select * from jsonb_array_elements(p_decrements) loop
      v_qty := (d->>'qty')::int;
      if v_qty is null or v_qty <= 0 then continue; end if;

      update public.product_lots
        set current_quantity = current_quantity - v_qty,
            updated_at = now()
        where id = (d->>'lot_id')::uuid
          and business_id = v_biz
          and current_quantity >= v_qty
        returning * into v_lot;

      if not found then
        raise exception 'STOCK_INSUFICIENTE: lote % (se pidió %)', d->>'lot_id', v_qty
          using errcode = 'P0001';
      end if;

      insert into public.inventory_movements (
        business_id, branch_id, product_id, warehouse_id, lot_id,
        type, quantity, reason, reference, user_id, user_name, proforma_id
      ) values (
        v_biz, v_lot.branch_id, v_lot.product_id, v_lot.warehouse_id, v_lot.id,
        'exit_sale', -v_qty,
        coalesce(d->>'reason', 'Salida por venta'), v_lot.lot_number,
        v_cashier, v_cashier_name, v_pid
      );
    end loop;
  end if;

  return jsonb_build_object('id', v_pid, 'reused', false);

exception
  when unique_violation then
    -- Carrera de idempotencia (dos POST simultáneos con la misma clave): la
    -- transacción se revierte; devolvemos la venta que ganó la carrera.
    if v_idem is not null then
      select id into v_existing from public.proformas
        where business_id = v_biz and idempotency_key = v_idem limit 1;
      if v_existing is not null then
        return jsonb_build_object('id', v_existing, 'reused', true);
      end if;
    end if;
    raise;
end;
$$;

-- ── B-03: anulación atómica con reingreso de stock ──────────────────────────
create or replace function public.void_sale_atomic(
  p_proforma_id uuid,
  p_reason text
) returns jsonb
language plpgsql
as $$
declare
  v_biz uuid := auth_business_id();
  v_status text;
  v_restored int := 0;
  m record;
  v_lot public.product_lots%rowtype;
begin
  if v_biz is null then
    raise exception 'No autenticado (sin business_id)' using errcode = '28000';
  end if;

  -- Bloquear la venta del tenant (FOR UPDATE evita doble anulación por carrera).
  select status into v_status from public.proformas
    where id = p_proforma_id and business_id = v_biz
    for update;
  if not found then
    raise exception 'Proforma no encontrada o no pertenece al negocio' using errcode = 'P0002';
  end if;

  -- Idempotencia: si ya está anulada, no reingresar stock otra vez.
  if v_status in ('cancelled', 'voided') then
    return jsonb_build_object('id', p_proforma_id, 'already_cancelled', true, 'restored', 0);
  end if;

  update public.proformas
    set status = 'cancelled', notes = p_reason, updated_at = now()
    where id = p_proforma_id and business_id = v_biz;

  -- Revertir los descuentos REALES de la venta (movimientos exit_sale con lote),
  -- no los lotes de los ítems (que pueden diferir por FEFO multi-lote).
  for m in
    select lot_id, quantity, branch_id, product_id, warehouse_id, reference
    from public.inventory_movements
    where proforma_id = p_proforma_id and business_id = v_biz
      and type = 'exit_sale' and lot_id is not null
  loop
    update public.product_lots
      set current_quantity = current_quantity + abs(m.quantity), updated_at = now()
      where id = m.lot_id and business_id = v_biz
      returning * into v_lot;
    if found then
      insert into public.inventory_movements (
        business_id, branch_id, product_id, warehouse_id, lot_id,
        type, quantity, reason, reference, user_id, user_name, proforma_id
      ) values (
        v_biz, m.branch_id, m.product_id, m.warehouse_id, m.lot_id,
        'return_in', abs(m.quantity),
        coalesce(p_reason, 'Devolución por anulación'), m.reference,
        auth.uid(), null, p_proforma_id
      );
      v_restored := v_restored + 1;
    end if;
  end loop;

  return jsonb_build_object('id', p_proforma_id, 'already_cancelled', false, 'restored', v_restored);
end;
$$;
