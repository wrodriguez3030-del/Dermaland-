-- Amplía `resumen_ventas_unificadas` con ITBIS y unidades vendidas.
--
-- Por qué: el índice de Reportes (`app/(app)/reportes/page.tsx`) enseña cuatro
-- cifras —Ventas, ITBIS recaudado, Ítems vendidos y Transacciones— y las cuatro
-- salían de `proformas`, que tiene 0 filas. Con el histórico migrado delante, el
-- dueño abría Reportes y veía RD$0.00 en las cuatro. Las dos primeras ya se
-- podían resolver con lo que la función devolvía; ITBIS y unidades no.
--
-- Lo que hay ahí de verdad hoy: RD$6 087 880,21 de ITBIS y 38 358 unidades.
--
-- 🔴 Por qué DROP y no CREATE OR REPLACE: `create or replace function` no puede
-- cambiar el tipo de retorno, y aquí se añaden cuatro columnas al `returns
-- table`. `scripts/db/apply-migration.mjs` envuelve todo en una transacción
-- (begin/commit), así que el drop y el create ocurren juntos: no hay un instante
-- en el que la función no exista.
--
-- 🔴 Y por qué esto NO rompe al código ya desplegado: PostgREST devuelve la fila
-- como JSON y `comoResumenVentas` lee las claves que conoce. Cuatro claves de
-- más se ignoran. El panel que hoy está en producción sigue funcionando igual
-- aunque esta migración se aplique antes de desplegar el código que las usa.
--
-- Los criterios de exclusión son EXACTAMENTE los mismos que ya tenía (y que la
-- función hermana `desglose_ventas_unificadas` repite): si se separan, el
-- resumen dejaría de cuadrar con el desglose y con los KPIs.

drop function if exists public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid);

create function public.resumen_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null
)
returns table (
  sistema_total numeric,
  sistema_cantidad integer,
  alegra_total numeric,
  alegra_cantidad integer,
  -- Nuevas. `itbis` sale de la cabecera de la factura en las dos mitades, así
  -- que mide lo mismo. `unidades` suma las cantidades de las LÍNEAS: una venta
  -- de 3 cajas cuenta 3, no 1.
  sistema_itbis numeric,
  sistema_unidades numeric,
  alegra_itbis numeric,
  alegra_unidades numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(agg_sistema.total, 0)::numeric    as sistema_total,
    coalesce(agg_sistema.cantidad, 0)::integer as sistema_cantidad,
    coalesce(agg_alegra.total, 0)::numeric     as alegra_total,
    coalesce(agg_alegra.cantidad, 0)::integer  as alegra_cantidad,
    coalesce(agg_sistema.itbis, 0)::numeric    as sistema_itbis,
    coalesce(uni_sistema.unidades, 0)::numeric as sistema_unidades,
    coalesce(agg_alegra.itbis, 0)::numeric     as alegra_itbis,
    coalesce(uni_alegra.unidades, 0)::numeric  as alegra_unidades
  from
    (
      select sum(pf.total) as total, count(*) as cantidad, sum(pf.itbis) as itbis
      from public.proformas pf
      where pf.business_id = p_business_id
        and pf.status not in ('cancelled', 'draft', 'expired', 'voided')
        and (p_desde is null or pf.created_at >= p_desde::timestamptz)
        and (p_hasta is null or pf.created_at < (p_hasta + 1)::timestamptz)
        and (p_cliente_id is null or pf.customer_id = p_cliente_id)
        and (p_sucursal_id is null or pf.branch_id = p_sucursal_id)
    ) as agg_sistema,
    (
      select sum(pi.quantity) as unidades
      from public.proforma_items pi
      join public.proformas pf on pf.id = pi.proforma_id
      where pf.business_id = p_business_id
        and pf.status not in ('cancelled', 'draft', 'expired', 'voided')
        and (p_desde is null or pf.created_at >= p_desde::timestamptz)
        and (p_hasta is null or pf.created_at < (p_hasta + 1)::timestamptz)
        and (p_cliente_id is null or pf.customer_id = p_cliente_id)
        and (p_sucursal_id is null or pf.branch_id = p_sucursal_id)
    ) as uni_sistema,
    (
      select sum(ai.total) as total, count(*) as cantidad, sum(ai.itbis) as itbis
      from public.alegra_invoices ai
      where ai.business_id = p_business_id
        and ai.status not in ('void', 'draft')
        and (p_desde is null or ai.date >= p_desde)
        and (p_hasta is null or ai.date <= p_hasta)
        and (p_cliente_id is null or ai.client_id = p_cliente_id)
        and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
    ) as agg_alegra,
    (
      select sum(it.quantity) as unidades
      from public.alegra_invoice_items it
      join public.alegra_invoices ai on ai.id = it.invoice_id
      where ai.business_id = p_business_id
        and ai.status not in ('void', 'draft')
        and (p_desde is null or ai.date >= p_desde)
        and (p_hasta is null or ai.date <= p_hasta)
        and (p_cliente_id is null or ai.client_id = p_cliente_id)
        and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
    ) as uni_alegra
$$;

comment on function public.resumen_ventas_unificadas is
  'Cuenta y suma ventas (proformas + alegra_invoices) en la base para el panel y el índice de Reportes, sin traer filas: total, transacciones, ITBIS y unidades, por origen. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts.';

-- Postgres concede EXECUTE a PUBLIC al crear la función: se revoca y se concede
-- solo a `authenticated`, igual que tenía antes del drop.
revoke execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
