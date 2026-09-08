-- «Bajo mínimo» cuenta SOLO los productos que tienen un mínimo configurado.
--
-- POR QUÉ ESTE FICHERO Y NO SE EDITA EL ANTERIOR
-- ──────────────────────────────────────────────
-- `20260909120000_resumen_inventario_panel.sql` YA ESTÁ APLICADA. Editarla
-- dejaría el repositorio y la base diciendo cosas distintas para siempre, sin
-- un solo error. Se reemplaza la función con un `create or replace` sobre LA
-- MISMA FIRMA, en una migración nueva. Todo lo demás se copia TAL CUAL: quien
-- compare los dos ficheros no debería encontrar más diferencia que la línea
-- marcada.
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- La tarjeta decía «600 productos bajo el mínimo», y era verdad en el sentido
-- literal y falsa en el que importa: de los 1 488 productos del catálogo,
-- 1 487 tienen el mínimo en CERO. Un producto sin mínimo y sin existencia
-- cumple «stock <= mínimo» —0 <= 0— y entraba en la cuenta. Así que la tarjeta
-- avisaba de 600 faltantes que nadie pidió vigilar, y el que sí importa se
-- perdía entre ellos.
--
-- Con este cambio la cuenta baja a 1: «Radiocare Ultra Crema Reparadora»,
-- mínimo 10, existencia 0. Ese es el faltante de verdad.
--
-- 🔴 Y deja a la vista algo que conviene saber: el mínimo por producto está
-- prácticamente sin usar (1 de 1 488). Mientras siga así, esta tarjeta va a
-- estar casi siempre vacía — que es lo correcto, pero no porque no falte nada,
-- sino porque nadie ha dicho todavía cuánto tiene que haber de cada cosa.
-- Medido contra la base real el 08/09/2026.

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
       -- 🔴 LA ÚNICA DIFERENCIA con la versión anterior: solo cuentan los
       -- productos con un mínimo PUESTO. Ver el porqué en la cabecera.
       and coalesce(p.min_stock, 0) > 0
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
