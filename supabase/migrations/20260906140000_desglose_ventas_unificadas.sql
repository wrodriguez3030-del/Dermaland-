-- Tarea 6b del plan "Alegra integrada al sistema": DESGLOSES de ventas
-- unificadas (proformas + alegra_invoices) agrupados y sumados EN LA BASE.
--
-- Hermana de `resumen_ventas_unificadas`
-- (20260906130000_resumen_ventas_unificadas.sql), y existe por lo que aquella
-- NO sabe hacer: devuelve UNA fila con cuatro columnas —total y cantidad por
-- origen— y no sabe agrupar. Por eso hoy el KPI de arriba dice «RD$48 454 899,08
-- · 14 743 transacciones» y la tarjeta «Ventas por vendedor», cuatro tarjetas
-- más abajo, dice «Sin ventas con vendedor»: `proformas` tiene 0 filas y el
-- desglose no mira `alegra_invoices`. El dueño pidió que se crearan los
-- vendedores y se les atribuyeran sus ventas (scripts/alegra/vincular-vendedores.mjs);
-- sin este desglose ese trabajo no se ve en ninguna pantalla.
--
-- Todo lo demás es idéntico a la función hermana, a propósito:
--
--   * Los agregados de PostgREST están DESACTIVADOS en este proyecto
--     (`PGRST123`, comprobado en vivo — ver la cabecera de la migración
--     hermana). Sin ellos, y SIN traer las 14 965 facturas ni los 31 213
--     renglones para agruparlos en Node (el antipatrón exacto que este plan
--     corrige), agrupar+sumar solo puede resolverse aquí.
--   * SECURITY INVOKER: corre con los privilegios y la RLS de quien llama
--     (igual que emit_sale_atomic/void_sale_atomic, ver DL-14 en
--     0035_dl14_function_search_path.sql). Filtrar por `business_id` aquí es
--     defensa en profundidad, no la única barrera.
--   * Los criterios de exclusión son LOS MISMOS, palabra por palabra. Si no
--     coincidieran, la suma de los desgloses no daría el total del KPI y no
--     habría forma de cuadrar la pantalla:
--       - proformas:       status not in ('cancelled','draft','expired','voided'),
--                          rango por `created_at`
--                          (EXCLUDED_STATUSES en features/customers/customer-purchases.ts)
--       - alegra_invoices: status not in ('void','draft'), rango por `date`
--                          (cuentaParaTotales en features/alegra/sales-report.ts)
--     Se duplica a propósito: no hay forma de compartir código TS con una
--     función SQL. Si una de esas dos listas cambia, cambian LAS DOS
--     migraciones.
--
-- Las tres dimensiones y de dónde sale cada una:
--
--   'vendedor'    proformas.seller_id, y su `seller_name` de etiqueta (vacío →
--                 «No asignado», el MISMO texto que `bySeller` en
--                 features/sales/sales-report.ts, que es de donde salen las
--                 filas del sistema en la misma tabla de la pantalla).
--
--                 En Alegra la clave es `seller_id` → `users.id`, la columna
--                 que creó 20260906120000_alegra_vendedor.sql precisamente
--                 «para que los reportes por vendedor y los incentivos
--                 funcionen […] no una comparación de cadenas en cada
--                 consulta». La etiqueta es el nombre real de la persona
--                 (`users.full_name`), no el texto a gritos de Alegra: la
--                 tarjeta enseñaba «LAURA MEJIA» donde la persona se llama
--                 «Laura Mejía».
--
--                 🔴 Pero `seller_id` NO basta por sí solo, y por eso hay un
--                 `left join lateral` y no un join a secas:
--
--                   * El sincronizador diario NO escribe `seller_id` (lo dice
--                     20260906120000: su upsert no manda esa columna). O sea:
--                     toda factura NUEVA de Alegra llega con `seller_id` NULL.
--                     Agrupando solo por `seller_id`, las ventas nuevas de
--                     Desteny caerían en una fila «sin vendedor» y ella
--                     cobraría de menos. En la tarjeta que este mismo plan
--                     llama «base de incentivos».
--                   * Agrupar por el texto tampoco vale: `btrim` no normaliza
--                     mayúsculas ni tildes, así que una factura escrita
--                     «Desteny Reynoso» abriría una SEGUNDA fila para la misma
--                     persona.
--
--                 Así que la fila busca su vendedor primero por `seller_id` y,
--                 si no lo trae, por nombre NORMALIZADO (mayúsculas y tildes
--                 fuera) contra `users` — el mismo criterio con el que
--                 `scripts/alegra/vincular-vendedores.mjs` los emparejó
--                 (`upper(trim(seller_name)) = upper($3)`), más las tildes. Con
--                 eso, la clave es el `users.id` de la persona en cuanto exista
--                 el usuario, esté la factura enlazada o no, y coincide con el
--                 espacio de claves de `bySeller` (que agrupa por `sellerId`).
--                 El `limit 1` del lateral es obligatorio: sin él, dos usuarios
--                 cuyo nombre normalice igual DUPLICARÍAN cada factura no
--                 enlazada, y un desglose de dinero no puede contar dos veces.
--
--                 Cuando no hay usuario que valga (antes de correr el guion de
--                 vinculación), la clave cae al nombre normalizado y la
--                 etiqueta al nombre tal como vino: el mismo reparto de hoy,
--                 pero ya sin poder partirse por una mayúscula.
--
--                 Sin vendedor en Alegra → «Oficina», que es como llama el
--                 proyecto a las ventas de mostrador sin vendedor
--                 (scripts/alegra/vincular-vendedores.mjs). «No asignado»
--                 (proformas) y «Oficina» (Alegra) son distintos a propósito:
--                 «Oficina» es un vendedor REAL del sistema, creado por el
--                 guion para las 8 197 facturas que Alegra dejó sin vendedor;
--                 «No asignado» es la ausencia del dato en una proforma. La
--                 columna `origen` deja claro cuál es cuál.
--
--   'forma_pago'  alegra_invoices.payment_method (vacío → «Sin forma de pago»,
--                 mismo texto que `porFormaPago` en agregados.ts).
--                 SOLO Alegra: en el sistema la forma de pago no vive en
--                 `proformas` sino en `proforma_payments`, con reparto por
--                 método y el concepto "mixto" (ver `saleMethodSummary` en
--                 features/sales/sales-report.ts). Reimplementar ESO en SQL
--                 sería inventar un cuarto criterio de forma de pago; la
--                 pantalla ya tiene el del sistema calculado y probado
--                 (`byPaymentMethod`), así que esta función aporta la mitad
--                 que falta, no la que ya existe.
--
--   'producto'    alegra_invoice_items unido a alegra_invoices por invoice_id,
--                 agrupando por product_id. `cantidad` son RENGLONES de
--                 factura, no unidades: `alegra_invoice_items.quantity` es
--                 numeric(14,3) y no cabe en el `integer` que devuelve esta
--                 función sin redondear (y redondear unidades vendidas es
--                 mentir). También SOLO Alegra: el sistema ya tiene
--                 `topProducts` sobre `proforma_items`.
--
--                 🔴 `total` es la suma de los totales de RENGLÓN y NO cuadra
--                 al céntimo con la suma de las facturas. Medido sobre la base
--                 real el 06/09/2026: renglones RD$48 454 899,50 contra
--                 facturas RD$48 454 899,08 — 42 centavos de diferencia en
--                 30 707 renglones, arrastre de redondeo de la propia
--                 migración de Alegra. Por eso el desglose por producto NO
--                 sirve para cuadrar contra el KPI (el de vendedor sí: ése
--                 suma cabeceras); sirve para saber qué se vendió.
--
--                 Verificado sobre la base real: los 31 213 renglones de la
--                 tabla traen product_id (ni uno vacío), de los que 506 son de
--                 facturas anuladas o en borrador y esta función deja fuera;
--                 hay 1 248 productos distintos, así que el tope de 200 filas
--                 recorta de verdad. El índice `alegra_invoice_items_product`
--                 (20260905200000_alegra_sync.sql:70) ya existe.
--
-- El `product_id` es NULLABLE en el esquema. Aunque hoy no haya ni uno vacío,
-- un renglón futuro sin producto se agrupa bajo la clave '' —con el nombre que
-- traiga el propio renglón como etiqueta— en vez de desaparecer: un desglose
-- que pierde dinero en silencio es peor que uno con una fila fea.
--
-- TOPE DE FILAS: la función devuelve como mucho 200 filas, las de mayor
-- importe. Ninguna consulta de este plan puede devolver una tabla entera, y
-- 'producto' hoy ya tiene 1 248 grupos (medido). Quien llame lo sabe y lo dice
-- (ver TOPE_DESGLOSE en
-- apps/web/src/server/repositories/supabase/ventas-unificadas.ts). Para
-- 'vendedor' y 'forma_pago' el tope no recorta nada —4 y 5 grupos— así que su
-- suma SÍ cuadra con `resumen_ventas_unificadas`, que es lo que comprueba
-- scripts/db/verificar-desglose-ventas.mjs.
--
-- Una dimensión desconocida devuelve CERO filas, no un error: la validación
-- del nombre vive en la ruta HTTP con zod (400), que es donde puede explicar
-- qué se pidió mal. Aquí, fallar cerrado —nada— es la respuesta segura.
--
-- 🔴 SIN APLICAR: esta tarea no toca la base en vivo. La aplica el dueño
-- cuando la revise. Hasta entonces `desgloseVentas()` lanza un error claro
-- (42883, función inexistente) y la pantalla lo enseña, en vez de camuflar el
-- problema con una tabla vacía.

-- 🔴 Esta función DEPENDE de 20260906120000_alegra_vendedor.sql: sin la columna
-- `alegra_invoices.seller_id`, el cuerpo no compila (Postgres valida el cuerpo
-- de una función `language sql` al crearla) y el error que da —«column
-- ai.seller_id does not exist»— no dice qué hacer. Esta guarda sí. Es el mismo
-- patrón que 20260906090100_dgii_fase2_tablas.sql, que se niega a correr si
-- falta su parte 1.
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

-- Nombre de vendedor normalizado para comparar: sin espacios de sobra, en
-- mayúsculas y sin tildes. Es el criterio con el que
-- `scripts/alegra/vincular-vendedores.mjs` emparejó los vendedores
-- (`upper(trim(seller_name)) = upper($3)`) más las tildes, que a él le faltaban
-- y por eso «Laura Mejía» y «LAURA MEJIA» le habrían parecido dos personas.
--
-- `translate` en vez de la extensión `unaccent`: unaccent no está instalada en
-- este proyecto y una migración no puede depender de que alguien la instale.
-- Las dos cadenas tienen que tener el MISMO número de caracteres, o `translate`
-- ignora la cola sin avisar (hay prueba de esto).
--
-- Los espacios de DENTRO también se colapsan, no solo los de los extremos:
-- comprobado contra un Postgres 16 efímero, sin eso «desteny  reynoso» (dos
-- espacios, tal como puede llegar de un campo de texto libre) abría una fila
-- aparte para la misma persona — el fallo exacto que esto viene a cerrar.
create or replace function public.nombre_vendedor_normalizado(p_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(
    translate(
      regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'),
      'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
      'AAAAAEEEEIIIIOOOOOUUUUNCAAAAAEEEEIIIIOOOOOUUUUNC'
    )
  )
$$;

comment on function public.nombre_vendedor_normalizado is
  'Nombre de vendedor en mayúsculas, sin tildes ni espacios de sobra, para emparejar el texto libre de Alegra con users.full_name. Ver 20260906140000_desglose_ventas_unificadas.sql.';

revoke execute on function public.nombre_vendedor_normalizado(text) from public, anon;
grant execute on function public.nombre_vendedor_normalizado(text) to authenticated;

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
  ) as d
  -- `etiqueta` desempata para que dos filas del mismo importe salgan siempre
  -- en el mismo orden: sin desempate, el tope de 200 podría quedarse con una
  -- fila distinta en cada llamada.
  order by d.total desc, d.etiqueta, d.origen
  limit 200
$$;

comment on function public.desglose_ventas_unificadas is
  'Desglose de ventas (proformas + alegra_invoices) por vendedor, forma de pago o producto, agrupado y sumado en la base, con el origen de cada fila y un tope de 200 filas. Hermana de resumen_ventas_unificadas. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts (tarea 6b, plan alegra-integrada).';

-- Postgres concede EXECUTE a PUBLIC al crear la función: se revoca y se
-- concede solo a `authenticated` (igual que cualquier SELECT normal contra
-- estas tablas — RLS ya excluye a `anon`, esto lo hace explícito también
-- para la función).
revoke execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) from public, anon;
grant execute on function public.desglose_ventas_unificadas(uuid, date, date, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
