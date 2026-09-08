-- Resumen de inventario del panel, calculado en la BASE.
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- El dueño lo dijo así: «tarda un par de segundos para cargar los datos». Y no
-- era la red ni la base — Vercel está en Virginia, Supabase en Ohio, 15 ms
-- entre las dos, y las consultas van en 50-110 ms. Lo que pesaba era lo que
-- viajaba al navegador:
--
--   productos (select *)   1 489 filas   1 425 KB de JSON
--   lotes     (select *)   1 931 filas   1 250 KB
--   ────────────────────────────────────────────────
--   total                                2 675 KB
--
-- ¿Para qué? Para cuatro números y tres listas de cinco filas: cuántos
-- productos hay, cuántos lotes vencen en 90 días, cuántos están bloqueados y
-- qué productos están bajo el mínimo. Todo eso cabe en 3 KB. El navegador
-- descargaba 2,6 MB, los recorría enteros y tiraba el 99,9%.
--
-- POR QUÉ UNA FUNCIÓN Y NO CUATRO CONSULTAS
-- ─────────────────────────────────────────
-- Los agregados de PostgREST están apagados en este proyecto (PGRST123), y
-- «productos bajo el mínimo» necesita agrupar. Además, cuatro consultas son
-- cuatro idas y vueltas; una función es una.
--
-- LOS CRITERIOS SON LOS MISMOS DEL CÓDIGO, NO PARECIDOS
-- ────────────────────────────────────────────────────
-- Se copian de `features/inventory/lot-selectors.ts`, que es quien los aplica
-- hoy en las pantallas de Vencimientos y Bloqueados. Si aquí dijeran otra cosa,
-- el panel y esas pantallas darían números distintos del mismo inventario:
--
--   · vence pronto  = con existencia (`current_quantity > 0`) y vencimiento
--                     dentro de la ventana. `lotsExpiringWithin`.
--   · bloqueado     = `quarantine` o `recalled`. `isBlockedLot`. OJO: NO
--                     incluye `expired`, aunque suene a bloqueado.
--   · vendible      = `available` y con existencia. `totalSellableStock`.
--   · bajo mínimo   = stock vendible <= `min_stock`.
--
-- `p_sucursales` nulo o vacío = todas las sucursales (el panel manda las que
-- el filtro tenga activas).

create or replace function public.resumen_inventario_panel(
  p_business_id uuid,
  p_sucursales uuid[] default null,
  p_dias integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sucursales as (
    select case when p_sucursales is null or cardinality(p_sucursales) = 0
                then null else p_sucursales end as ids
  ),
  lotes as (
    select pl.*
      from public.product_lots pl, sucursales s
     where pl.business_id = p_business_id
       and (s.ids is null or pl.branch_id = any(s.ids))
  ),
  vencen as (
    select l.id, l.lot_number, l.current_quantity, l.expires_at, l.product_id,
           (l.expires_at::date - current_date) as dias
      from lotes l
     where l.current_quantity > 0
       and l.expires_at is not null
       and l.expires_at::date <= current_date + p_dias
  ),
  vendible as (
    select l.product_id, sum(l.current_quantity) as stock
      from lotes l
     where l.status = 'available' and l.current_quantity > 0
     group by 1
  ),
  bajos as (
    select p.id, p.name, p.sku, coalesce(p.min_stock, 0) as min_stock,
           coalesce(v.stock, 0)::int as stock
      from public.products p
      left join vendible v on v.product_id = p.id
     where p.business_id = p_business_id
       and p.deleted_at is null
       and coalesce(v.stock, 0) <= coalesce(p.min_stock, 0)
  )
  select jsonb_build_object(
    'totalProductos',
      (select count(*) from public.products p
        where p.business_id = p_business_id and p.deleted_at is null),
    'vencenPronto', jsonb_build_object(
      'total',   (select count(*) from vencen),
      -- «Críticos» = menos de 15 días, igual que `vencimientosCriticos`.
      'criticos',(select count(*) from vencen where dias < 15),
      'lista',   coalesce((
        select jsonb_agg(x order by x->>'expiresAt')
          from (
            select jsonb_build_object(
              'id', v.id, 'lotNumber', v.lot_number,
              'currentQuantity', v.current_quantity,
              'expiresAt', v.expires_at,
              'productName', coalesce(p.name, '(producto borrado)')
            ) as x
              from vencen v left join public.products p on p.id = v.product_id
             order by v.expires_at limit 5
          ) t
      ), '[]'::jsonb)
    ),
    'bloqueados', (select count(*) from lotes where status in ('quarantine', 'recalled')),
    'bajoMinimo', jsonb_build_object(
      'total', (select count(*) from bajos),
      'lista', coalesce((
        select jsonb_agg(x order by (x->>'stock')::int)
          from (
            select jsonb_build_object(
              'id', b.id, 'name', b.name, 'sku', b.sku,
              'minStock', b.min_stock, 'stock', b.stock
            ) as x
              from bajos b order by b.stock, b.name limit 5
          ) t
      ), '[]'::jsonb)
    )
  )
$$;

comment on function public.resumen_inventario_panel(uuid, uuid[], integer) is
  'Resumen de inventario del panel en una sola consulta. Sustituye a descargar 2,6 MB de productos y lotes al navegador para calcular cuatro números.';

revoke execute on function public.resumen_inventario_panel(uuid, uuid[], integer) from public, anon;
grant execute on function public.resumen_inventario_panel(uuid, uuid[], integer) to authenticated;

notify pgrst, 'reload schema';
