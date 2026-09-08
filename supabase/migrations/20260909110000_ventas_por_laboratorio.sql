-- Ventas del histórico migrado agrupadas por laboratorio (y por producto).
--
-- QUÉ VIENE A ARREGLAR
-- ────────────────────
-- «Productos → Laboratorios» (apps/web/src/app/(app)/productos/laboratorios/page.tsx)
-- sale ENTERA en cero en producción: «RD$0.00», «0 unidades», «— Sin ventas»,
-- con las 80 barras del ranking planas. No es que no haya ventas: la pantalla
-- se alimenta de `useProformas()` y `proformas` tiene CERO filas — el punto de
-- venta propio todavía no ha cobrado nada y los RD$48,4 millones del negocio
-- están en `alegra_invoices`. Es el mismo fallo mudo que ya se cerró en el
-- panel, en reportes y en la ficha del cliente: una pantalla que dice «no hay»
-- cuando lo que pasa es que está mirando la tabla vacía.
--
-- Medido contra la base real el 07/09/2026 (facturas no anuladas):
--
--   con laboratorio   23 026 renglones   RD$38 967 487,93
--   SIN laboratorio    7 689 renglones   RD$ 9 500 943,07   ← 20% del histórico
--   ─────────────────────────────────────────────────────
--   total             30 715 renglones   RD$48 468 431,00
--
--   La Roche-Posay  RD$4 990 824,43 · 2 119 u
--   Eucerin         RD$4 293 999,98 · 2 885 u
--   ACM             RD$2 826 757,60 · 2 144 u
--
-- 🔴 Los RD$9,5 millones de productos SIN laboratorio asignado NO se descartan:
-- salen en la fila «Sin laboratorio» que la pantalla ya sabe pintar
-- (`includeUnassigned` en features/products/lab-sales.ts). Esconderlos haría
-- que la suma del ranking no cuadrara con el total del negocio, que es
-- exactamente la clase de descuadre silencioso que aquí no se acepta.
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA CONSULTA
-- ─────────────────────────────────────
-- Los agregados de PostgREST están DESACTIVADOS en este proyecto (400
-- PGRST123, comprobado en vivo): todo lo que sume vive en una función SQL.
-- Misma disciplina que `desglose_ventas_unificadas`: `security invoker` (la
-- RLS del que llama sigue mandando), `set search_path = public`, y permiso
-- solo para `authenticated`.
--
-- POR QUÉ SOLO ALEGRA
-- ───────────────────
-- Igual que las dimensiones 'producto', 'sucursal' y 'forma_pago' del
-- desglose: la mitad del sistema ya la calcula `computeLabSales` sobre las
-- proformas, con TODOS sus filtros aplicados y su propio criterio de qué
-- estado cuenta como venta. Reimplementarlo en SQL sería inventar un segundo
-- criterio que tarde o temprano diría otra cosa. Aquí se suma solo el
-- histórico y la pantalla junta las dos mitades.
--
-- LOS DOS NIVELES
-- ───────────────
--   'laboratorio'  una fila por laboratorio. `facturas` es el número de
--                  facturas DISTINTAS donde aparece — por eso hace falta este
--                  nivel y no basta con sumar el de productos: una factura con
--                  dos productos del mismo laboratorio es UNA venta, no dos.
--   'producto'     una fila por producto, con su laboratorio al lado. Lo usa
--                  la hoja de Excel del ranking (`computeLabProductSales`).
--                  La etiqueta es el nombre del renglón MÁS RECIENTE, no el
--                  alfabéticamente primero: si en Alegra le cambiaron el
--                  nombre al producto, se enseña el último que se usó.
--
-- `clave` es texto (no uuid) y vale '' cuando no hay laboratorio: el mismo
-- convenio que ya usa `desglose_ventas_unificadas`, para que quien la consume
-- no tenga que distinguir null de vacío.

create or replace function public.ventas_por_laboratorio(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_sucursal_id uuid default null,
  p_nivel text default 'laboratorio'
)
returns table (
  clave text,
  etiqueta text,
  laboratorio_id text,
  total numeric,
  unidades numeric,
  facturas integer
)
language sql
stable
security invoker
set search_path = public
as $$
  -- ── nivel laboratorio ──────────────────────────────────────────────────
  select
    coalesce(p.laboratory_id::text, '')                          as clave,
    coalesce(nullif(btrim(l.name), ''), 'Sin laboratorio')       as etiqueta,
    coalesce(p.laboratory_id::text, '')                          as laboratorio_id,
    coalesce(sum(ii.total), 0)::numeric                          as total,
    coalesce(sum(ii.quantity), 0)::numeric                       as unidades,
    count(distinct ii.invoice_id)::integer                       as facturas
  from public.alegra_invoice_items ii
  join public.alegra_invoices ai on ai.id = ii.invoice_id
  -- `left join`: un renglón cuyo producto ya no existe en el catálogo sigue
  -- siendo dinero vendido y cae en «Sin laboratorio», no se pierde.
  left join public.products p
         on p.id = ii.product_id and p.business_id = ii.business_id
  left join public.laboratories l
         on l.id = p.laboratory_id and l.business_id = ii.business_id
  where p_nivel = 'laboratorio'
    and ii.business_id = p_business_id
    and ai.business_id = p_business_id
    and ai.status not in ('void', 'draft')
    and (p_desde is null or ai.date >= p_desde)
    and (p_hasta is null or ai.date <= p_hasta)
    and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
  group by 1, 2, 3

  union all

  -- ── nivel producto ─────────────────────────────────────────────────────
  select
    coalesce(ii.product_id::text, '')                                   as clave,
    (array_agg(ii.name order by ai.date desc, ii.line_no desc))[1]      as etiqueta,
    coalesce(p.laboratory_id::text, '')                                 as laboratorio_id,
    coalesce(sum(ii.total), 0)::numeric                                 as total,
    coalesce(sum(ii.quantity), 0)::numeric                              as unidades,
    count(distinct ii.invoice_id)::integer                              as facturas
  from public.alegra_invoice_items ii
  join public.alegra_invoices ai on ai.id = ii.invoice_id
  left join public.products p
         on p.id = ii.product_id and p.business_id = ii.business_id
  where p_nivel = 'producto'
    and ii.business_id = p_business_id
    and ai.business_id = p_business_id
    and ai.status not in ('void', 'draft')
    and (p_desde is null or ai.date >= p_desde)
    and (p_hasta is null or ai.date <= p_hasta)
    and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
  group by 1, 3

  order by 4 desc
$$;

comment on function public.ventas_por_laboratorio(uuid, date, date, uuid, text) is
  'Ventas del histórico migrado de Alegra por laboratorio (o por producto). Solo lectura. Los productos sin laboratorio salen con clave vacía y etiqueta «Sin laboratorio»: son el 20% del histórico y no se descartan.';

revoke execute on function public.ventas_por_laboratorio(uuid, date, date, uuid, text) from public, anon;
grant execute on function public.ventas_por_laboratorio(uuid, date, date, uuid, text) to authenticated;

notify pgrst, 'reload schema';
