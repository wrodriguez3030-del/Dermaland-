-- B-06 (validación de producción 2026-07-12): defensa-en-profundidad contra stock
-- negativo. El decremento real ya es atómico (RPC `decrement_lot_stock` con
-- `WHERE current_quantity >= p_qty`) y la API de ajuste valida `>= 0`, pero un
-- CHECK a nivel BD garantiza la invariante ante cualquier escritura futura/buggy.
-- Verificado antes de aplicar: 0 filas con current_quantity < 0.

alter table public.product_lots
  add constraint product_lots_qty_nonneg check (current_quantity >= 0);
