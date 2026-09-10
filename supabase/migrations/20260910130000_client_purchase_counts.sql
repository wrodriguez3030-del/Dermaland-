-- "Unificar clientes" preseleccionaba a quien recibe por `clients.total_orders`
-- — columna que SOLO cuenta ventas del POS propio (`proformas`). Casi todos
-- los 6 544 clientes vienen de la migración de Alegra y tienen `total_orders
-- = 0` aunque tengan cientos de facturas reales: la pantalla decía "0
-- compras" a un cliente con historial, el mismo silencio que
-- `resumen_ventas_unificadas`/`desglose_ventas_unificadas` ya cerraron para
-- el panel y los reportes.
--
-- `client_purchase_counts()` da el conteo REAL combinando las dos fuentes,
-- con el MISMO criterio de exclusión que esas funciones (no se reinventa):
--   proformas.status not in ('cancelled','draft','expired','voided')
--   alegra_invoices.status not in ('void','draft')
--
-- SECURITY INVOKER (RLS de `proformas`/`alegra_invoices` aplica sobre el
-- invocador; el filtro explícito por `auth_business_id()` es defensa en
-- profundidad, no la única barrera). STABLE: es una lectura pura.
create or replace function public.client_purchase_counts()
returns table (client_id uuid, purchases bigint)
language sql
stable
set search_path = public
as $$
  select x.client_id, count(*) as purchases
  from (
    select customer_id as client_id
    from public.proformas
    where business_id = auth_business_id()
      and status not in ('cancelled', 'draft', 'expired', 'voided')
      and customer_id is not null
    union all
    select client_id
    from public.alegra_invoices
    where business_id = auth_business_id()
      and status not in ('void', 'draft')
      and client_id is not null
  ) x
  group by x.client_id;
$$;

notify pgrst, 'reload schema';
