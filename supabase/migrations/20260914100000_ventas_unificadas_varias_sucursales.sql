-- Multi-sucursal real en las tres funciones de ventas unificadas: el panel
-- de filtros (agendapp) trae "Locales / Sucursales" como selección MÚLTIPLE,
-- y hasta ahora `resumen_ventas_unificadas`/`desglose_ventas_unificadas`/
-- `panel_ventas_unificadas` solo aceptaban UNA (`p_sucursal_id uuid`).
--
-- QUÉ HACE Y QUÉ NO
-- ─────────────────
-- Añade `p_sucursal_ids uuid[] default null` AL FINAL de cada firma, con el
-- MISMO predicado `or` que ya usa `p_sucursal_id`, así que:
--   · 0 sucursales (ambos null)  → sin filtro, igual que hoy.
--   · 1 sucursal   (`p_sucursal_id`)              → exactamente la consulta
--     de siempre, byte a byte — `p_sucursal_ids` no se manda desde el cliente
--     en ese caso (ver `apps/web/src/server/repositories/supabase/
--     ventas-unificadas.ts`, `argsSucursal`).
--   · 2+ sucursales (`p_sucursal_ids`, `p_sucursal_id` en null)  → `= any(...)`.
-- No se reescribe ninguna agregación existente: se copia TAL CUAL el cuerpo
-- vigente de cada función (las mismas exclusiones, el mismo orden, el mismo
-- tope de 200 en el desglose) y solo se añade la rama del predicado.
--
-- DROP + CREATE, no `create or replace`: añadir un parámetro cambia la lista
-- de tipos de entrada, que es la IDENTIDAD de la función para Postgres.
-- `create or replace` con una firma distinta no reemplaza nada — crea una
-- SEGUNDA función con el mismo nombre, y PostgREST deja de saber cuál
-- llamar (`PGRST203`, "Could not choose the best candidate function") aun
-- para las llamadas de una sola sucursal que hoy funcionan bien. `drop
-- function if exists <firma vieja>` dejando UNA sola firma final evita esa
-- ambigüedad por diseño.
--
-- `panel_ventas_unificadas` reenvía `p_sucursal_ids` a las dos funciones que
-- envuelve (mismo patrón que ya hace con `p_sucursal_id`): no aporta un
-- camino de agregación nuevo, solo pasa el parámetro.
--
-- 🔴 SIN APLICAR: esta migración no toca la base en vivo. La aplica el dueño
-- explícitamente, con `node scripts/apply-migration.mjs
-- supabase/migrations/20260914100000_ventas_unificadas_varias_sucursales.sql`.
-- Mientras no se aplique, `apps/web/src/server/repositories/supabase/
-- ventas-unificadas.ts` detecta el error de PostgREST (función sin esta
-- firma) y lanza un mensaje que nombra este archivo — nunca un total que
-- calla que dejó fuera la selección de 2+ sucursales.

-- ─── resumen_ventas_unificadas ───────────────────────────────────────────────

drop function if exists public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid);

create function public.resumen_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null,
  p_sucursal_ids uuid[] default null
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
      and (p_sucursal_ids is null or pf.branch_id = any(p_sucursal_ids))
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
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
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
  'Totales de ventas (proformas + alegra_invoices) calculados en la base para el panel y los reportes: total, transacciones, ITBIS, unidades y descuentos por origen, más los clientes distintos de la UNIÓN. Admite una sucursal (p_sucursal_id) o varias (p_sucursal_ids). Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts.';

revoke execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid, uuid[]) to authenticated;

-- ─── desglose_ventas_unificadas ──────────────────────────────────────────────

drop function if exists public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text);

create function public.desglose_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null,
  p_dimension text default 'vendedor',
  p_sucursal_ids uuid[] default null
)
returns table (
  clave text,
  etiqueta text,
  origen text,
  cantidad integer,
  total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.clave, d.etiqueta, d.origen, d.cantidad, d.total
  from (
    -- ── vendedor · ventas del sistema (proformas) ──────────────────────────
    select
      coalesce(pf.seller_id::text, '')                            as clave,
      coalesce(nullif(btrim(pf.seller_name), ''), 'No asignado')  as etiqueta,
      'sistema'::text                                             as origen,
      count(*)::integer                                           as cantidad,
      coalesce(sum(pf.total), 0)::numeric                         as total
    from public.proformas pf
    where p_dimension = 'vendedor'
      and pf.business_id = p_business_id
      and pf.status not in ('cancelled', 'draft', 'expired', 'voided')
      and (p_desde is null or pf.created_at >= p_desde::timestamptz)
      and (p_hasta is null or pf.created_at < (p_hasta + 1)::timestamptz)
      and (p_cliente_id is null or pf.customer_id = p_cliente_id)
      and (p_sucursal_id is null or pf.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or pf.branch_id = any(p_sucursal_ids))
    group by 1, 2

    union all

    -- ── vendedor · histórico migrado (alegra_invoices) ─────────────────────
    select
      coalesce(
        v.id::text,
        coalesce(nullif(public.nombre_vendedor_normalizado(ai.seller_name), ''), 'OFICINA')
      )                                                                        as clave,
      coalesce(
        v.full_name,
        nullif(regexp_replace(btrim(max(ai.seller_name)), '\s+', ' ', 'g'), ''),
        'Oficina'
      )                                                                        as etiqueta,
      'alegra'::text                                                                           as origen,
      count(*)::integer                                                                        as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                                      as total
    from public.alegra_invoices ai
    left join lateral (
      select u.id, u.full_name
      from public.users u
      where u.business_id = ai.business_id
        and (
          u.id = ai.seller_id
          or (
            ai.seller_id is null
            and public.nombre_vendedor_normalizado(u.full_name)
                = coalesce(nullif(public.nombre_vendedor_normalizado(ai.seller_name), ''), 'OFICINA')
          )
        )
      order by (u.id = ai.seller_id) desc, u.created_at, u.id
      limit 1
    ) as v on true
    where p_dimension = 'vendedor'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1, v.full_name

    union all

    -- ── forma de pago · histórico migrado ──────────────────────────────────
    select
      coalesce(nullif(btrim(ai.payment_method), ''), '')                  as clave,
      coalesce(nullif(btrim(ai.payment_method), ''), 'Sin forma de pago') as etiqueta,
      'alegra'::text                                                      as origen,
      count(*)::integer                                                   as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                 as total
    from public.alegra_invoices ai
    where p_dimension = 'forma_pago'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1, 2

    union all

    -- ── producto · renglones del histórico migrado ─────────────────────────
    select
      coalesce(ii.product_id::text, '')                                       as clave,
      (array_agg(ii.name order by ai.date desc, ii.line_no desc))[1]           as etiqueta,
      'alegra'::text                                                          as origen,
      count(*)::integer                                                       as cantidad,
      coalesce(sum(ii.total), 0)::numeric                                     as total
    from public.alegra_invoice_items ii
    join public.alegra_invoices ai on ai.id = ii.invoice_id
    where p_dimension = 'producto'
      and ii.business_id = p_business_id
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1

    union all

    -- ── sucursal · histórico migrado ───────────────────────────────────────
    select
      coalesce(ai.branch_id::text, '')                                    as clave,
      coalesce(nullif(btrim(b.name), ''), 'Sin sucursal')                 as etiqueta,
      'alegra'::text                                                      as origen,
      count(*)::integer                                                   as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                 as total
    from public.alegra_invoices ai
    left join public.branches b
      on b.id = ai.branch_id
     and b.business_id = ai.business_id
    where p_dimension = 'sucursal'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1, 2

    union all

    -- ── mes · serie de tiempo del histórico migrado ────────────────────────
    select
      to_char(date_trunc('month', ai.date), 'YYYY-MM')                    as clave,
      (array['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
             'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])[
        extract(month from ai.date)::int
      ] || ' ' || to_char(ai.date, 'YYYY')                                as etiqueta,
      'alegra'::text                                                      as origen,
      count(*)::integer                                                   as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                 as total
    from public.alegra_invoices ai
    where p_dimension = 'mes'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1, 2

    union all

    -- ── cliente · histórico migrado ─────────────────────────────────────────
    select
      coalesce(ai.client_id::text, '')                                    as clave,
      coalesce(
        nullif(btrim((array_agg(ai.client_name order by ai.date desc))[1]), ''),
        'Sin cliente'
      )                                                                    as etiqueta,
      'alegra'::text                                                      as origen,
      count(*)::integer                                                   as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                 as total
    from public.alegra_invoices ai
    where p_dimension = 'cliente'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1

    union all

    -- ── comprobante · histórico migrado ─────────────────────────────────────
    select
      case upper(left(coalesce(ai.ncf, ''), 3))
        when 'B02' then 'b02'
        when 'B01' then 'b01'
        when 'E32' then 'e32'
        when 'E31' then 'e31'
        else 'other'
      end                                                                  as clave,
      case upper(left(coalesce(ai.ncf, ''), 3))
        when 'B02' then 'Factura de consumo (B02)'
        when 'B01' then 'Crédito fiscal (B01)'
        when 'E32' then 'Consumo e-CF (E32)'
        when 'E31' then 'Crédito fiscal e-CF (E31)'
        else 'Otro comprobante'
      end                                                                  as etiqueta,
      'alegra'::text                                                      as origen,
      count(*)::integer                                                   as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                 as total
    from public.alegra_invoices ai
    where p_dimension = 'comprobante'
      and ai.business_id = p_business_id
      and ai.status not in ('void', 'draft')
      and (p_desde is null or ai.date >= p_desde)
      and (p_hasta is null or ai.date <= p_hasta)
      and (p_cliente_id is null or ai.client_id = p_cliente_id)
      and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
      and (p_sucursal_ids is null or ai.branch_id = any(p_sucursal_ids))
    group by 1, 2
  ) as d
  order by d.total desc, d.etiqueta, d.origen
  limit 200
$$;

comment on function public.desglose_ventas_unificadas is
  'Desglose de ventas (proformas + alegra_invoices) por vendedor, forma de pago, producto, sucursal, mes, cliente o comprobante, agrupado y sumado en la base, con el origen de cada fila y un tope de 200 filas. Admite una sucursal (p_sucursal_id) o varias (p_sucursal_ids). Hermana de resumen_ventas_unificadas. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts.';

revoke execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text, uuid[]) from public, anon;
grant execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text, uuid[]) to authenticated;

-- ─── panel_ventas_unificadas ─────────────────────────────────────────────────
-- Solo reenvía `p_sucursal_ids` a las dos funciones de arriba: ningún camino
-- de agregación nuevo.

drop function if exists public.panel_ventas_unificadas(uuid, date, date, uuid, uuid, text[], boolean);

create function public.panel_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null,
  p_dimensiones text[] default '{}'::text[],
  p_con_resumen boolean default true,
  p_sucursal_ids uuid[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'resumen',
    case when p_con_resumen then (
      select to_jsonb(r)
      from public.resumen_ventas_unificadas(
        p_business_id, p_desde, p_hasta, p_cliente_id, p_sucursal_id, p_sucursal_ids
      ) r
    ) end,
    'desgloses',
    coalesce(
      (
        select jsonb_object_agg(t.dim, t.filas)
        from (
          select
            d.dim,
            coalesce(
              (
                select jsonb_agg(to_jsonb(x))
                from public.desglose_ventas_unificadas(
                  p_business_id, p_desde, p_hasta, p_cliente_id, p_sucursal_id, d.dim, p_sucursal_ids
                ) x
              ),
              '[]'::jsonb
            ) as filas
          -- `distinct`: pedir dos veces la misma dimensión no puede reventar el
          -- `jsonb_object_agg` con una clave repetida.
          from (select distinct unnest(p_dimensiones) as dim) d
        ) t
      ),
      '{}'::jsonb
    )
  );
$$;

-- Mismos permisos que las dos funciones que envuelve: si esta fuera más
-- abierta, sería una puerta de atrás a lo que ellas protegen.
revoke execute on function public.panel_ventas_unificadas(uuid, date, date, uuid, uuid, text[], boolean, uuid[]) from public, anon;
grant execute on function public.panel_ventas_unificadas(uuid, date, date, uuid, uuid, text[], boolean, uuid[]) to authenticated;

notify pgrst, 'reload schema';
