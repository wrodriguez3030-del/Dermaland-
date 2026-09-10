-- Clientes de prueba para probar transacciones del POS a diario (Willian
-- Rodriguez, Alan Rodriguez, Rodrigo Rodriguez — ya creados por fuera de esta
-- migración, con customer_number CLI-TEST-*). Sus ventas de prueba deben
-- desaparecer cada noche para no ensuciar la reconciliación con Alegra: una
-- venta de prueba que Alegra nunca vio no puede quedar viva en DermaLand.
--
-- Identificados por ID FIJO, no por nombre — así un cliente real que algún
-- día se llame igual nunca puede caer en esta limpieza por accidente.
--
-- Cada noche: revierte el stock que las ventas de prueba consumieron (mismo
-- criterio que `void_sale_atomic`, 0029), borra los movimientos de
-- inventario ligados (si no, quedarían huérfanos con proforma_id NULL para
-- siempre — `inventory_movements.proforma_id` es SET NULL, no CASCADE) y
-- borra la venta por completo (no "cancelada": nunca existió para Alegra).
-- `ar_promises.proforma_id` es NO ACTION — se borran primero para que el
-- borrado de la venta no falle si alguna prueba tocó el flujo de crédito.

create extension if not exists pg_cron with schema extensions;

create or replace function public.limpiar_ventas_prueba_diarias()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_biz uuid := '00000000-0000-0000-0000-00000000d001';
  v_test_ids uuid[] := array[
    '4a73832f-6d37-489a-bbe4-641908c8d842', -- Willian Rodriguez (CLI-TEST-WILLIAN)
    'ac39aba0-a898-4173-ae34-e3e77b3a53a9', -- Alan Rodriguez (CLI-TEST-ALAN)
    'edc1651b-f101-4cc0-9e15-d34dfb364854'  -- Rodrigo Rodriguez (CLI-TEST-RODRIGO)
  ];
  v_proforma_ids uuid[];
  v_restaurados int := 0;
  v_borrados int := 0;
  m record;
begin
  select array_agg(id) into v_proforma_ids
  from public.proformas
  where business_id = v_biz and customer_id = any(v_test_ids);

  if v_proforma_ids is null or array_length(v_proforma_ids, 1) is null then
    return jsonb_build_object('ok', true, 'ventas_borradas', 0, 'lotes_restaurados', 0, 'ejecutado_en', now());
  end if;

  for m in
    select lot_id, quantity from public.inventory_movements
    where proforma_id = any(v_proforma_ids) and type = 'exit_sale' and lot_id is not null
  loop
    update public.product_lots
      set current_quantity = current_quantity + abs(m.quantity), updated_at = now()
      where id = m.lot_id;
    v_restaurados := v_restaurados + 1;
  end loop;

  delete from public.inventory_movements where proforma_id = any(v_proforma_ids);
  delete from public.ar_promises where proforma_id = any(v_proforma_ids);

  delete from public.proformas where id = any(v_proforma_ids);
  get diagnostics v_borrados = row_count;

  return jsonb_build_object(
    'ok', true,
    'ventas_borradas', v_borrados,
    'lotes_restaurados', v_restaurados,
    'ejecutado_en', now()
  );
end;
$$;

-- pg_cron corre en UTC siempre, sin importar la zona de la base. 07:00 UTC =
-- 03:00 AST (Santo Domingo) — madrugada, sin tráfico real del negocio.
-- `cron.schedule` con nombre es upsert: reaplicar esta migración no duplica el job.
select cron.schedule(
  'limpiar-ventas-prueba-diarias',
  '0 7 * * *',
  $$select public.limpiar_ventas_prueba_diarias();$$
);
