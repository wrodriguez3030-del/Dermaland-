-- Dos dimensiones más para `desglose_ventas_unificadas`: 'cliente' y
-- 'comprobante'.
--
-- POR QUÉ EXISTE ESTE FICHERO Y NO SE EDITA EL ORIGINAL
-- ─────────────────────────────────────────────────────
-- `20260907120000_desglose_ventas_sucursal_mes.sql` YA ESTÁ APLICADA en
-- producción. Editarla dejaría la base y el repositorio diciendo cosas
-- distintas para siempre. Así que se reemplaza la función con un
-- `create or replace` sobre LA MISMA FIRMA, en una migración nueva.
--
-- Todo lo demás —las cinco ramas que ya existían, los criterios de exclusión,
-- el orden, el tope, los permisos— se copia TAL CUAL de la versión vigente.
-- Esta migración no cambia ni una fila de lo que el desglose ya devolvía:
-- solo añade dos ramas.
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- Dos tarjetas del reporte de ventas («Clientes principales» y
-- «Comprobantes», `apps/web/src/app/(app)/reportes/ventas/resumenes-ventas.tsx`)
-- salen EN BLANCO («Sin clientes.» / «Sin comprobantes.») en producción ahora
-- mismo, porque se alimentan SOLO de `proformas`, que tiene 0 filas: el punto
-- de venta propio todavía no ha cobrado nada y las 15 005 facturas reales
-- están en `alegra_invoices`. Las otras cuatro tarjetas (vendedor, forma de
-- pago, producto, sucursal) ya combinan las dos fuentes desde
-- `20260906140000`/`20260907120000`; estas dos se habían quedado fuera
-- porque la base todavía no sabía agruparlas.
--
-- LAS DOS RAMAS NUEVAS
-- ────────────────────
--
--   'cliente'      `alegra_invoices.client_id`, con el nombre MÁS RECIENTE de
--                  ese cliente (mismo criterio que 'producto': si en Alegra
--                  le corrigieron el nombre, se enseña el que se usó la
--                  última vez, no un fósil). Sin cliente (contacto borrado en
--                  Alegra — un caso real conocido) → «Sin cliente».
--
--                  SOLO Alegra, igual que 'forma_pago'/'producto'/'sucursal':
--                  la mitad del sistema la calcula la pantalla con TODOS sus
--                  filtros aplicados (`topCustomers` en
--                  features/sales/sales-report.ts), igual que ya hacen esas
--                  tres tarjetas.
--
--   'comprobante'  Clasifica el NCF de Alegra por PREFIJO — B02/B01/E32/E31,
--                  cualquier otro cae en «Otro comprobante» — con las MISMAS
--                  claves y el MISMO texto que `ComprobanteKey`/
--                  `COMPROBANTE_LABEL` en features/sales/sales-report.ts, que
--                  es quien clasifica el lado del sistema
--                  (`comprobanteKey`/`byComprobante`) y pinta esta misma
--                  tarjeta cuando el histórico no participa. Dos nombres para
--                  el mismo tipo de documento serían dos filas donde hay una.
--                  `migracion-desglose.test.ts` ata las dos copias.
--
-- Lo que NO cambia respecto de la versión vigente, y por qué importa que no
-- cambie:
--
--   * `language sql`, `stable`, `security invoker`, `set search_path = public`.
--   * Los criterios de exclusión, palabra por palabra:
--       - proformas:       status not in ('cancelled','draft','expired','voided')
--       - alegra_invoices: status not in ('void','draft')
--   * Una dimensión desconocida devuelve CERO filas, no un error.
--   * `revoke ... from public, anon` + `grant ... to authenticated`, y el
--     `notify pgrst, 'reload schema'`.
--
-- 🔴 SIN APLICAR: esta tarea no toca la base en vivo. La aplica el dueño.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alegra_invoices'
      and column_name = 'seller_id'
  ) then
    raise exception 'Falta aplicar antes 20260906120000_alegra_vendedor.sql (no existe alegra_invoices.seller_id). Comando: node scripts/db/apply-migration.mjs supabase/migrations/20260906120000_alegra_vendedor.sql --apply';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.nombre_vendedor_normalizado(text)') is null then
    raise exception 'Falta aplicar antes 20260906140000_desglose_ventas_unificadas.sql (no existe public.nombre_vendedor_normalizado). Comando: node scripts/db/apply-migration.mjs supabase/migrations/20260906140000_desglose_ventas_unificadas.sql --apply';
  end if;
end $$;

create or replace function public.desglose_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null,
  p_dimension text default 'vendedor'
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
    group by 1, 2

    union all

    -- ── cliente · histórico migrado ─────────────────────────────────────────
    -- La etiqueta es el nombre MÁS RECIENTE de ese cliente en Alegra (mismo
    -- criterio que 'producto'): si le corrigieron el nombre, se enseña el que
    -- se usó la última vez. Sin cliente (contacto borrado en Alegra) → «Sin
    -- cliente», nunca se inventa un nombre.
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
    group by 1

    union all

    -- ── comprobante · histórico migrado ─────────────────────────────────────
    -- Clasifica por el PREFIJO del NCF — B02/B01 son NCF tradicional, E32/E31
    -- son e-CF, cualquier otro cae en «Otro comprobante» — con las MISMAS
    -- claves y el MISMO texto que `ComprobanteKey`/`COMPROBANTE_LABEL`
    -- (features/sales/sales-report.ts), que es quien clasifica la mitad del
    -- sistema. `migracion-desglose.test.ts` ata las dos copias.
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
    group by 1, 2
  ) as d
  order by d.total desc, d.etiqueta, d.origen
  limit 200
$$;

comment on function public.desglose_ventas_unificadas is
  'Desglose de ventas (proformas + alegra_invoices) por vendedor, forma de pago, producto, sucursal, mes, cliente o comprobante, agrupado y sumado en la base, con el origen de cada fila y un tope de 200 filas. Hermana de resumen_ventas_unificadas. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts (tarjetas del reporte de ventas, plan alegra-integrada).';

revoke execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) from public, anon;
grant execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
