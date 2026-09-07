-- Dos dimensiones más para `desglose_ventas_unificadas`: 'sucursal' y 'mes'.
--
-- POR QUÉ EXISTE ESTE FICHERO Y NO SE EDITA EL ORIGINAL
-- ─────────────────────────────────────────────────────
-- `20260906140000_desglose_ventas_unificadas.sql` YA ESTÁ APLICADA en
-- producción. Editarla dejaría la base y el repositorio diciendo cosas
-- distintas para siempre: el fichero enseñaría cinco dimensiones y la función
-- viva tendría tres, sin un solo error. Así que se reemplaza la función con un
-- `create or replace` sobre LA MISMA FIRMA, en una migración nueva.
--
-- Todo lo demás —las tres ramas que ya existían, los criterios de exclusión,
-- el orden, el tope, los permisos— se copia TAL CUAL del original. Esta
-- migración no cambia ni una fila de lo que el desglose ya devolvía: solo
-- añade dos ramas. Quien la lea debería poder comparar las dos versiones y no
-- encontrar más diferencia que eso.
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- Cuatro tarjetas del panel (`apps/web/src/app/(app)/page.tsx`) salen EN
-- BLANCO en producción ahora mismo —«Sin datos este mes.», una línea plana en
-- cero— porque se alimentan de `proformas`, que tiene 0 filas: el punto de
-- venta propio todavía no ha cobrado nada y todo el histórico está en
-- `alegra_invoices`. Dos de ellas («Cobros por método de pago» y «Top
-- productos del mes») ya tenían su dimensión en el original; las otras dos
-- necesitan estas dos ramas nuevas.
--
-- Medido contra la base real el 07/09/2026, septiembre 2026 (89 facturas ·
-- RD$317 723,13):
--
--   sucursal   Dermaland  Villa Olga   41   RD$165 985,00
--              DermaLand Principal     48   RD$151 738,13
--   mes        2026-04  432  RD$1 580 965,66  …  2026-09  89  RD$317 723,13
--
-- LAS DOS RAMAS NUEVAS
-- ────────────────────
--
--   'sucursal'  `alegra_invoices.branch_id`, con el NOMBRE REAL de la sucursal
--               (`branches.name`) de etiqueta. El join va por la clave
--               primaria de `branches`, así que no puede duplicar una factura
--               —y aun así lleva `b.business_id = ai.business_id`: una
--               sucursal de otra empresa no puede prestarle su nombre a una
--               factura de ésta.
--
--               Sin sucursal → «Sin sucursal», que es EXACTAMENTE el texto que
--               ya pone la mitad del sistema de esa misma tarjeta
--               (`salesByBranch` en features/dashboard/dashboard-metrics.ts:
--               `branchName(id) || "Sin sucursal"`). Si aquí dijera otra cosa,
--               la misma tarjeta enseñaría dos filas con el mismo significado y
--               distinto nombre. La prueba `migracion-desglose.test.ts` ata las
--               dos copias.
--
--               SOLO Alegra, igual que 'forma_pago' y 'producto': la mitad del
--               sistema ya la calcula la pantalla con TODOS sus filtros
--               aplicados (ver `FUENTES_DESGLOSE` en
--               features/ventas/venta-unificada.ts y el porqué largo en
--               reportes/ventas/desglose-tarjetas.tsx).
--
--   'mes'       Serie de tiempo por `date_trunc('month', ai.date)`.
--
--               🔴 `clave` es 'YYYY-MM' (no el nombre del mes) para que ORDENE
--               bien y para que la pantalla pueda casar cada mes con su cubo
--               sin traducir nada: `mesesDeLaTendencia`
--               (features/dashboard/dashboard-metrics.ts) genera esa MISMA
--               clave para los cubos del sistema. Una etiqueta como «Sep 2026»
--               ordenada alfabéticamente pondría abril delante de septiembre.
--
--               `etiqueta` es legible en español —«Sep 2026»— y se construye
--               con un array literal, NO con `to_char(..., 'Mon YYYY')`: eso
--               último depende de `lc_time` del servidor y devolvería «Sep» en
--               inglés o en el idioma que tenga puesto la base. Los doce
--               nombres son los MISMOS de `MONTHS_ES` en dashboard-metrics.ts,
--               y la prueba los compara uno a uno.
--
--               🔴 La rama respeta `p_desde`/`p_hasta` como todas las demás
--               —tiene que hacerlo, o el desglose dejaría de cuadrar con el
--               KPI—. Es QUIEN LLAMA el que decide no mandarle el filtro de
--               mes/año del panel y mandarle en su lugar la ventana de los
--               últimos 6 meses: una serie de tiempo recortada al mes elegido
--               se colapsa a un solo punto. Ese criterio ya era el de
--               `monthlyTrend` en el panel y no cambia aquí.
--
--               El tope de 200 filas no recorta: harían falta más de 16 años
--               de historia para llegar, y la pantalla pide 6 meses.
--
-- Lo que NO cambia respecto del original, y por qué importa que no cambie:
--
--   * `language sql`, `stable`, `security invoker`, `set search_path = public`.
--     SECURITY INVOKER: corre con los privilegios y la RLS de quien llama
--     (DL-14, 0035_dl14_function_search_path.sql). Filtrar por `business_id`
--     aquí es defensa en profundidad, no la única barrera.
--   * Los criterios de exclusión, palabra por palabra:
--       - proformas:       status not in ('cancelled','draft','expired','voided'),
--                          rango por `created_at`
--       - alegra_invoices: status not in ('void','draft'), rango por `date`
--     Si una rama perdiera el suyo, el desglose y el KPI de arriba dejarían de
--     sumar lo mismo SIN UN SOLO ERROR. `migracion-desglose.test.ts` lo
--     comprueba RAMA POR RAMA, en todas las versiones del fichero, y dice cuál
--     falla.
--   * Una dimensión desconocida devuelve CERO filas, no un error: la
--     validación del nombre vive en la ruta HTTP con zod (400), que es donde
--     puede explicar qué se pidió mal.
--   * `revoke ... from public, anon` + `grant ... to authenticated`, y el
--     `notify pgrst, 'reload schema'` para que PostgREST se entere.
--
-- 🔴 SIN APLICAR: esta tarea no toca la base en vivo. La aplica el dueño.
-- Después, `node scripts/db/verificar-desglose-ventas.mjs` comprueba contra la
-- base real que las cinco dimensiones responden y que el desglose sigue
-- cuadrando con el KPI.

-- 🔴 Misma guarda que el original: el cuerpo lee `alegra_invoices.seller_id`,
-- que crea `20260906120000_alegra_vendedor.sql`. Sin esa columna, Postgres
-- valida el cuerpo al crear la función y falla con «column ai.seller_id does
-- not exist», que no dice qué hacer. Esta guarda sí, y va ANTES de crear nada.
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

-- 🔴 Y la guarda del ayudante: `nombre_vendedor_normalizado` la declara
-- 20260906140000 y esta función lo llama. Si alguien aplicara esta migración
-- sola sobre una base sin aquélla, el error sería «function
-- public.nombre_vendedor_normalizado(text) does not exist», que tampoco dice
-- qué aplicar. No se redeclara aquí a propósito: dos copias del normalizador
-- se separarían y «Laura Mejía» volvería a partirse en dos filas.
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
      -- Clave: el `seller_id` de la proforma, igual que `bySeller`. La etiqueta,
      -- su `seller_name` (una foto del nombre al vender) y «No asignado»
      -- cuando no hubo vendedor — el MISMO texto de `bySeller`, que es quien
      -- pone las filas del sistema en esta misma tabla.
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
      -- Sin vendedor en Alegra ES «Oficina»: la clave de comparación lo dice,
      -- para que una factura nueva sin vendedor caiga en el MISMO grupo que
      -- las 8 197 que el guion ató al usuario «Oficina», y no en una fila
      -- suelta al lado con el mismo nombre.
      coalesce(
        v.id::text,
        coalesce(nullif(public.nombre_vendedor_normalizado(ai.seller_name), ''), 'OFICINA')
      )                                                                        as clave,
      -- Sin usuario que valga, el nombre tal como vino de Alegra, con los
      -- espacios de sobra fuera (los mismos que colapsa la clave).
      coalesce(
        v.full_name,
        nullif(regexp_replace(btrim(max(ai.seller_name)), '\s+', ' ', 'g'), ''),
        'Oficina'
      )                                                                        as etiqueta,
      'alegra'::text                                                                           as origen,
      count(*)::integer                                                                        as cantidad,
      coalesce(sum(ai.total), 0)::numeric                                                      as total
    from public.alegra_invoices ai
    -- Un vendedor como MUCHO por factura (`limit 1`): sin el lateral, dos
    -- usuarios cuyo nombre normalice igual duplicarían la factura y el
    -- desglose contaría dos veces. Primero el enlace real (`seller_id`), y
    -- solo si falta, el nombre normalizado.
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
    -- Se agrupa por la clave y por el nombre del usuario (que es constante
    -- dentro de la clave cuando la clave ES el usuario). `max(ai.seller_name)`
    -- solo entra cuando no hay usuario: da un representante estable del texto
    -- de Alegra, que dentro del grupo solo cambia en mayúsculas o tildes.
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
    -- Los filtros son los MISMOS de la factura (estado, fechas, business_id,
    -- cliente, sucursal): un renglón de una factura anulada no es una venta.
    -- La etiqueta es el nombre del renglón MÁS RECIENTE de ese producto (no
    -- el alfabéticamente primero): si en Alegra le cambiaron el nombre, el
    -- desglose enseña el que se usó la última vez, no un fósil.
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
    -- El join a `branches` va por su clave primaria: no puede multiplicar una
    -- factura. `b.business_id = ai.business_id` es defensa en profundidad — una
    -- sucursal de otra empresa no le presta su nombre a una factura de ésta.
    -- Sin sucursal (o con una que ya no existe) → «Sin sucursal», el MISMO
    -- texto que pone `salesByBranch` en la mitad del sistema de esa tarjeta.
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
    -- `clave` = 'YYYY-MM' para que ordene bien y para casar con los cubos que
    -- genera `mesesDeLaTendencia` en el navegador. `etiqueta` = «Sep 2026»,
    -- con los nombres escritos aquí y no con `to_char(..., 'Mon YYYY')`, que
    -- depende del `lc_time` del servidor.
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
  ) as d
  -- `etiqueta` desempata para que dos filas del mismo importe salgan siempre
  -- en el mismo orden: sin desempate, el tope de 200 podría quedarse con una
  -- fila distinta en cada llamada.
  order by d.total desc, d.etiqueta, d.origen
  limit 200
$$;

comment on function public.desglose_ventas_unificadas is
  'Desglose de ventas (proformas + alegra_invoices) por vendedor, forma de pago, producto, sucursal o mes, agrupado y sumado en la base, con el origen de cada fila y un tope de 200 filas. Hermana de resumen_ventas_unificadas. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts (tarjetas del panel, plan alegra-integrada).';

-- Postgres concede EXECUTE a PUBLIC al crear la función: se revoca y se
-- concede solo a `authenticated` (igual que cualquier SELECT normal contra
-- estas tablas — RLS ya excluye a `anon`, esto lo hace explícito también
-- para la función). `create or replace` NO conserva los permisos anteriores,
-- así que se repiten aquí: sin esto, la función quedaría abierta a `anon`.
revoke execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) from public, anon;
grant execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
