-- Métricas por cliente que incluyen el histórico migrado de Alegra.
--
-- Por qué: el Reporte de Clientes y el listado calculan «Total gastado»,
-- «Compras» y «Última visita» desde las cabeceras de `proformas`, que tiene 0
-- filas. Resultado: 6 523 clientes con RD$0.00 y sin última visita, teniendo
-- 14 743 facturas suyas migradas. Un cliente que gastó RD$200 000 aparecía como
-- si nunca hubiera comprado.
--
-- Por qué EN LA BASE y no en el servidor: el camino honesto sin esto sería
-- traerse las 14 743 cabeceras en cada petición para agruparlas en Node. Se
-- agrupa donde están los datos y viaja una fila por cliente CON COMPRAS —hoy
-- unas 5 700, no 14 743.
--
-- 🔴 Solo devuelve la mitad de ALEGRA. La del sistema la sigue calculando
-- `computeCustomerPurchaseStats`, que es la misma función que usa el perfil del
-- cliente y sabe cosas que el SQL no: conversiones de proforma a factura (para
-- no contar la venta dos veces) y proformas pendientes. Duplicar esa lógica
-- aquí sería una segunda definición de «lo comprado», y este proyecto ya pagó
-- caro tener varias definiciones del mismo número.
--
-- Criterios de exclusión IDÉNTICOS a `resumen_ventas_unificadas` y
-- `desglose_ventas_unificadas`: si se separan, el total del cliente dejaría de
-- cuadrar con el KPI y con el desglose.

create or replace function public.metricas_clientes_alegra(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_sucursal_id uuid default null
)
returns table (
  cliente_id uuid,
  total numeric,
  compras integer,
  ultima_fecha date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ai.client_id                as cliente_id,
    sum(ai.total)::numeric      as total,
    count(*)::integer           as compras,
    max(ai.date)                as ultima_fecha
  from public.alegra_invoices ai
  where ai.business_id = p_business_id
    and ai.client_id is not null
    and ai.status not in ('void', 'draft')
    and (p_desde is null or ai.date >= p_desde)
    and (p_hasta is null or ai.date <= p_hasta)
    and (p_sucursal_id is null or ai.branch_id = p_sucursal_id)
  group by ai.client_id
$$;

comment on function public.metricas_clientes_alegra is
  'Gasto, compras y última visita POR CLIENTE del histórico migrado de Alegra, agregados en la base. La mitad del sistema la calcula computeCustomerPurchaseStats (misma función que el perfil). Ver app/api/customers/metrics/route.ts.';

revoke execute on function public.metricas_clientes_alegra(uuid, date, date, uuid) from public, anon;
grant execute on function public.metricas_clientes_alegra(uuid, date, date, uuid) to authenticated;

notify pgrst, 'reload schema';
