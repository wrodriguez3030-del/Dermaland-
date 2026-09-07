-- Amplía `resumen_ventas_unificadas` con descuentos y clientes distintos.
--
-- Por qué: el Reporte de Ventas enseña 10 indicadores y solo 3 contaban el
-- histórico migrado (Total facturado, Transacciones, Ticket promedio). Los
-- otros 7 salían del sistema —hoy, cero— con la etiqueta «Solo ventas del
-- sistema». Con las columnas que ya devuelve la función (ITBIS y unidades, de
-- `20260907140000`) más estas dos, siete de los diez pasan a contar de verdad.
--
-- Los que se quedan fuera, y por qué:
--   · Devoluciones — Alegra no migró notas de crédito; no hay de dónde sacarlas.
--   · Margen estimado — necesita el costo por línea, y `alegra_invoice_items` no
--     lo trae (solo precio de venta).
--   · Neto — se deriva de Total menos Devoluciones, así que hereda lo anterior.
--
-- 🔴 `clientes_distintos` NO va por origen, va uno solo sobre la UNIÓN. Sumar
-- «distintos del sistema» + «distintos de Alegra» contaría dos veces a quien
-- compró en los dos sitios: la suma de dos conteos de distintos no es el conteo
-- de distintos de la unión. Hoy `proformas` está vacía y daría igual; el día que
-- no lo esté, esa suma sería falsa y nadie lo notaría.
--
-- El criterio de agrupación imita al del sistema (`buildSalesReport`): el id del
-- cliente si lo hay, si no su nombre, y si tampoco, la factura cuenta como un
-- cliente propio (una venta anónima no se funde con otra).
--
-- DROP + CREATE porque `create or replace` no puede cambiar el tipo de retorno.
-- `apply-migration.mjs` envuelve en transacción, así que no hay hueco. Y añadir
-- columnas no rompe al código desplegado: PostgREST devuelve JSON y las claves
-- de más se ignoran.

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
  sistema_itbis numeric,
  sistema_unidades numeric,
  alegra_itbis numeric,
  alegra_unidades numeric,
  sistema_descuento numeric,
  alegra_descuento numeric,
  /** Distintos sobre la UNIÓN de las dos fuentes, no la suma de dos conteos. */
  clientes_distintos integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with pf as (
    select pf.id, pf.total, pf.itbis, pf.discount, pf.customer_id, pf.customer_name
    from public.proformas pf
    where pf.business_id = p_business_id
      and pf.status not in ('cancelled', 'draft', 'expired', 'voided')
      and (p_desde is null or pf.created_at >= p_desde::timestamptz)
      and (p_hasta is null or pf.created_at < (p_hasta + 1)::timestamptz)
      and (p_cliente_id is null or pf.customer_id = p_cliente_id)
      and (p_sucursal_id is null or pf.branch_id = p_sucursal_id)
  ),
  ai as (
    select ai.id, ai.total, ai.itbis, ai.discount, ai.client_id, ai.client_name
    from public.alegra_invoices ai
    where ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
  )
  select
    coalesce((select sum(total) from pf), 0)::numeric        as sistema_total,
    coalesce((select count(*) from pf), 0)::integer          as sistema_cantidad,
    coalesce((select sum(total) from ai), 0)::numeric        as alegra_total,
    coalesce((select count(*) from ai), 0)::integer          as alegra_cantidad,
    coalesce((select sum(itbis) from pf), 0)::numeric        as sistema_itbis,
    coalesce((
      select sum(pi.quantity) from public.proforma_items pi
      where pi.proforma_id in (select id from pf)
    ), 0)::numeric                                            as sistema_unidades,
    coalesce((select sum(itbis) from ai), 0)::numeric        as alegra_itbis,
    coalesce((
      select sum(it.quantity) from public.alegra_invoice_items it
      where it.invoice_id in (select id from ai)
    ), 0)::numeric                                            as alegra_unidades,
    coalesce((select sum(discount) from pf), 0)::numeric     as sistema_descuento,
    coalesce((select sum(discount) from ai), 0)::numeric     as alegra_descuento,
    coalesce((
      select count(distinct clave) from (
        select coalesce(customer_id::text, nullif(customer_name, ''), 'anon-' || id::text) as clave from pf
        union all
        select coalesce(client_id::text,   nullif(client_name, ''),   'anon-' || id::text) as clave from ai
      ) u
    ), 0)::integer                                            as clientes_distintos
$$;

comment on function public.resumen_ventas_unificadas is
  'Totales de ventas (proformas + alegra_invoices) calculados en la base para el panel y los reportes: total, transacciones, ITBIS, unidades y descuentos por origen, más los clientes distintos de la UNIÓN. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts.';

revoke execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
