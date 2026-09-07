-- Tarea 3 del plan "Alegra integrada al sistema": resumen de ventas
-- unificadas (proformas + alegra_invoices) contado y sumado EN LA BASE.
--
-- Por qué existe esta función y no un simple `select=total.sum()`:
-- PostgREST soporta agregados en `select` desde la v12.1, pero está
-- DESACTIVADO en este proyecto — comprobado en vivo, de forma read-only,
-- contra la base real:
--
--   GET .../rest/v1/alegra_invoices?select=total.sum()&limit=1
--   → 400 { "code": "PGRST123", "message": "Use of aggregate functions is
--     not allowed" }
--
-- Sin agregados de PostgREST, y SIN traer las hasta 14 965 facturas para
-- sumarlas en Node (el antipatrón exacto que este plan corrige — ver "El
-- rendimiento no es un extra de este plan" en la spec), la cuenta+suma solo
-- puede resolverse aquí: una función SQL simple, con los índices que ya trajo
-- la migración de Alegra (`alegra_invoices_business_date`, `_business_client`).
--
-- Los estados excluidos de los totales replican EXACTAMENTE los que ya usan
-- `desdeProforma`/`desdeFacturaAlegra` (features/ventas/venta-unificada.ts),
-- para que este número nunca discrepe de lo que un reporte calcularía sumando
-- las filas de `listarVentasUnificadas` en memoria:
--   - proformas:        EXCLUDED_STATUSES en features/customers/customer-purchases.ts
--                        ('cancelled','draft','expired','voided')
--   - alegra_invoices:  cuentaParaTotales en features/alegra/sales-report.ts
--                        (excluye 'void' y 'draft')
-- Si alguna de esas dos listas cambia, esta función se queda desincronizada:
-- no hay forma de compartir código TS con una función SQL, así que el
-- criterio se duplica a propósito, con la cita exacta de dónde vive el
-- original.
--
-- SECURITY INVOKER a propósito (igual que emit_sale_atomic/void_sale_atomic,
-- ver DL-14 en 0035_dl14_function_search_path.sql): corre con los privilegios
-- y la RLS de quien llama. Filtrar por `business_id` aquí es defensa en
-- profundidad, no la única barrera — las políticas RLS de `proformas` y
-- `alegra_invoices` siguen aplicando dentro de la función.
--
-- 🔴 SIN APLICAR: esta tarea (3 de 8) no toca la base en vivo. La aplica el
-- dueño del proyecto cuando la revise. Hasta entonces,
-- `resumenVentas()` (apps/web/src/server/repositories/supabase/ventas-unificadas.ts)
-- lanza un error claro (42883, función inexistente) en vez de camuflar el
-- problema trayendo filas de más.

create or replace function public.resumen_ventas_unificadas(
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
  alegra_cantidad integer
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
    coalesce(agg_alegra.cantidad, 0)::integer  as alegra_cantidad
  from
    (
      select sum(pf.total) as total, count(*) as cantidad
      from public.proformas pf
      where pf.business_id = p_business_id
        and pf.status not in ('cancelled', 'draft', 'expired', 'voided')
        and (p_desde is null or pf.created_at >= p_desde::timestamptz)
        and (p_hasta is null or pf.created_at < (p_hasta + 1)::timestamptz)
        and (p_cliente_id is null or pf.customer_id = p_cliente_id)
        and (p_sucursal_id is null or pf.branch_id = p_sucursal_id)
    ) as agg_sistema,
    (
      select sum(ai.total) as total, count(*) as cantidad
      from public.alegra_invoices ai
      where ai.business_id = p_business_id
        and ai.status not in ('void', 'draft')
        and (p_desde is null or ai.date >= p_desde)
        and (p_hasta is null or ai.date <= p_hasta)
        and (p_cliente_id is null or ai.client_id = p_cliente_id)
        and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
    ) as agg_alegra
$$;

comment on function public.resumen_ventas_unificadas is
  'Cuenta y suma ventas (proformas + alegra_invoices) en la base para el panel unificado, sin traer filas. Ver apps/web/src/server/repositories/supabase/ventas-unificadas.ts (tarea 3, plan alegra-integrada).';

-- Postgres concede EXECUTE a PUBLIC al crear la función: se revoca y se
-- concede solo a `authenticated` (igual que cualquier SELECT normal contra
-- estas tablas — RLS ya excluye a `anon`, esto lo hace explícito también
-- para la función).
revoke execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.resumen_ventas_unificadas(uuid, date, date, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
