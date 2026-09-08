-- Una PÁGINA de clientes, con sus compras, filtrada y ordenada en la base.
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- El dueño, dos veces: «tarda un par de segundos», «aún 3 segundos es muy
-- lento». Medido el 08/09/2026, la pantalla de clientes hacía esto:
--
--   · La lista completa se pide en tandas de 1 000 (tope de PostgREST), y son
--     6 523 clientes → SIETE idas y vueltas seguidas: 1 394 ms.
--   · Más las métricas de compras de los 5 995 clientes con historial: 431 ms.
--   · Total ~1,8 s de servidor ANTES de mandar nada, y después el navegador
--     recibe 3,5 MB de JSON que tiene que interpretar, filtrar y ordenar.
--
-- Una página de 50 tarda 76 ms. Eso es lo que hace esta función.
--
-- (Y una cosa que NO era el problema, para que no se busque ahí: la red. Vercel
-- comprime con brotli y los 3,5 MB viajan como 320 KB. Lo caro eran las siete
-- idas y vueltas y el trabajo del navegador, no el ancho de banda.)
--
-- POR QUÉ EN LA BASE Y NO PAGINANDO EN EL SERVIDOR
-- ────────────────────────────────────────────────
-- Porque la tabla se ordena por «total gastado» y «última visita», que son
-- agregados de `alegra_invoices`. Ordenar por eso exige conocerlo de TODOS los
-- clientes antes de cortar la página: en el navegador eso obliga a bajárselos
-- todos, que es justo el problema. En SQL es un join y un `order by`.
--
-- LOS CRITERIOS SON LOS DE LA PANTALLA, NO PARECIDOS
-- ──────────────────────────────────────────────────
-- · La búsqueda mira nombre, apellido, número de cliente, documento, correo,
--   teléfono y whatsapp — los mismos campos que `coincideCliente`, incluida la
--   comparación por SOLO DÍGITOS del teléfono (los teléfonos se guardan con
--   guiones y buscar «8297141975» no encontraba a nadie).
-- · «Compras» y «total gastado» excluyen anuladas y borradores, igual que
--   `metricas_clientes_alegra`.
-- · `p_creados_este_mes` = el mismo filtro que el enlace del panel.

create or replace function public.pagina_clientes(
  p_business_id uuid,
  p_busqueda text default null,
  p_fuente text default null,
  p_tipo_piel text default null,
  p_creados_este_mes boolean default false,
  p_orden text default 'createdAt',
  p_desc boolean default true,
  p_limite integer default 50,
  p_desplazamiento integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with parametros as (
    select nullif(btrim(coalesce(p_busqueda, '')), '') as q,
           -- Solo dígitos, para que «8297141975» encuentre «829-714-1975».
           nullif(regexp_replace(coalesce(p_busqueda, ''), '\D', '', 'g'), '') as digitos,
           least(greatest(coalesce(p_limite, 50), 1), 200) as limite,
           greatest(coalesce(p_desplazamiento, 0), 0) as salto
  ),
  compras as (
    select ai.client_id,
           sum(ai.total)::numeric as total,
           count(*)::integer      as compras,
           max(ai.date)           as ultima
      from public.alegra_invoices ai
     where ai.business_id = p_business_id
       and ai.client_id is not null
       and ai.status not in ('void', 'draft')
     group by ai.client_id
  ),
  base as (
    select c.id, c.first_name, c.last_name, c.customer_number, c.document_number,
           c.document_type, c.phone, c.whatsapp, c.email, c.source, c.skin_type,
           c.tags, c.created_at,
           coalesce(m.total, 0)   as total,
           coalesce(m.compras, 0) as compras,
           m.ultima,
           -- Claves de orden, ya calculadas: el `order by` de abajo solo elige.
           lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as clave_nombre,
           case p_orden
             when 'totalSpent'  then coalesce(m.total, 0)
             when 'totalOrders' then coalesce(m.compras, 0)::numeric
             when 'lastVisit'   then extract(epoch from coalesce(m.ultima, '1970-01-01'::date))
             else                    extract(epoch from c.created_at)
           end as clave_num
      from public.clients c
      left join compras m on m.client_id = c.id, parametros p
     where c.business_id = p_business_id
       and c.deleted_at is null
       and (p_fuente is null or p_fuente = '' or c.source = p_fuente)
       and (p_tipo_piel is null or p_tipo_piel = '' or c.skin_type = p_tipo_piel)
       and (not p_creados_este_mes
            or date_trunc('month', c.created_at) = date_trunc('month', now()))
       and (
         p.q is null
         or c.first_name      ilike '%' || p.q || '%'
         or c.last_name       ilike '%' || p.q || '%'
         or (coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) ilike '%' || p.q || '%'
         or c.customer_number ilike '%' || p.q || '%'
         or c.document_number ilike '%' || p.q || '%'
         or c.email           ilike '%' || p.q || '%'
         or (p.digitos is not null and length(p.digitos) >= 3 and (
               regexp_replace(coalesce(c.phone,''),    '\D', '', 'g') like '%' || p.digitos || '%'
            or regexp_replace(coalesce(c.whatsapp,''), '\D', '', 'g') like '%' || p.digitos || '%'
         ))
       )
  ),
  pagina as (
    select b.*
      from base b, parametros p
     -- 🔴 El desempate por `id` no es cosmético: sin él, dos clientes con el
     -- mismo nombre (hay varias «Ana») pueden salir en distinto orden entre una
     -- página y la siguiente, y entonces una fila se repite y otra se pierde.
     order by
       case when p_orden = 'name' and p_desc then b.clave_nombre end desc nulls last,
       case when p_orden = 'name' and not p_desc then b.clave_nombre end asc nulls last,
       case when p_orden <> 'name' and p_desc then b.clave_num end desc nulls last,
       case when p_orden <> 'name' and not p_desc then b.clave_num end asc nulls last,
       b.id
     limit (select limite from parametros) offset (select salto from parametros)
  )
  select jsonb_build_object(
    'total',          (select count(*)::int from base),
    'limite',         (select limite from parametros),
    'desplazamiento', (select salto from parametros),
    'filas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'customer', jsonb_build_object(
            'id', g.id, 'firstName', g.first_name, 'lastName', g.last_name,
            'customerNumber', g.customer_number, 'documentNumber', g.document_number,
            'documentType', g.document_type, 'phone', g.phone, 'whatsapp', g.whatsapp,
            'email', g.email, 'source', g.source, 'skinType', g.skin_type,
            'tags', coalesce(g.tags, '{}'), 'createdAt', g.created_at
          ),
          'stats', jsonb_build_object(
            'totalSpent', g.total, 'purchases', g.compras, 'lastVisitAt', g.ultima
          )
        )
      )
      -- Se vuelve a ordenar aquí: `jsonb_agg` no hereda el orden del CTE.
      from (
        select * from pagina
         order by
           case when p_orden = 'name' and p_desc then clave_nombre end desc nulls last,
           case when p_orden = 'name' and not p_desc then clave_nombre end asc nulls last,
           case when p_orden <> 'name' and p_desc then clave_num end desc nulls last,
           case when p_orden <> 'name' and not p_desc then clave_num end asc nulls last,
           id
      ) g
    ), '[]'::jsonb)
  )
$$;

comment on function public.pagina_clientes(uuid, text, text, text, boolean, text, boolean, integer, integer) is
  'Una página de clientes con sus compras, filtrada y ordenada en la base. Sustituye a bajar los 6 523 clientes al navegador (7 idas y vueltas, ~1,8 s) para filtrar y ordenar allí.';

revoke execute on function public.pagina_clientes(uuid, text, text, text, boolean, text, boolean, integer, integer) from public, anon;
grant execute on function public.pagina_clientes(uuid, text, text, text, boolean, text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
