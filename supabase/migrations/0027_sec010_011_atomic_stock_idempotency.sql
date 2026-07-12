-- SEC-010: decremento ATÓMICO de stock de lote (evita sobreventa por carrera).
-- SEC-011: clave de idempotencia en proformas (evita doble factura/NCF por
-- doble-submit o reintento). Ambas ADITIVAS y no destructivas.

-- ── SEC-010 ──────────────────────────────────────────────────────────────────
-- Decrementa `current_quantity` en una sola sentencia con guarda
-- `current_quantity >= p_qty`. Devuelve la fila si tuvo éxito; 0 filas si no hay
-- stock suficiente (o el lote no es del tenant). No es SECURITY DEFINER: corre
-- con los privilegios del llamador y respeta RLS por `business_id`.
create or replace function public.decrement_lot_stock(
  p_lot_id uuid,
  p_qty integer,
  p_business_id uuid
)
returns setof public.product_lots
language sql
volatile
set search_path = public
as $$
  update public.product_lots
  set current_quantity = current_quantity - p_qty,
      updated_at = now()
  where id = p_lot_id
    and business_id = p_business_id
    and p_qty > 0
    and current_quantity >= p_qty
  returning *;
$$;

-- ── SEC-011 ──────────────────────────────────────────────────────────────────
alter table public.proformas
  add column if not exists idempotency_key text;

-- Único por empresa cuando está presente: dos POST con la misma clave no crean
-- dos ventas. Las filas existentes (key null) quedan excluidas del índice.
create unique index if not exists proformas_idempotency_key_uidx
  on public.proformas (business_id, idempotency_key)
  where idempotency_key is not null;

notify pgrst, 'reload schema';
