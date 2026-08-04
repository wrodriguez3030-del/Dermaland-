-- 0039_web_order_payment_columns.sql
-- Dónde se anotará el cobro con tarjeta el día que exista la afiliación.
--
-- Las columnas se crean ahora, vacías, para que activar la pasarela sea escribir
-- el adaptador y nada más: migrar una tabla que ya tiene pedidos dentro es
-- justo lo que conviene no tener que hacer con el negocio funcionando.
--
-- Hoy TODOS los pedidos son `payment_status = 'pendiente'` y se cobran en el POS
-- cuando el cliente llega a retirar. Ver `docs/pagos-en-linea.md`.

alter table public.web_orders
  add column if not exists payment_provider  text,
  add column if not exists payment_reference text,
  add column if not exists paid_at           timestamptz;

-- Para conciliar: del identificador que devuelve el banco al pedido.
create index if not exists web_orders_payment_reference_idx
  on public.web_orders (payment_reference)
  where payment_reference is not null;

notify pgrst, 'reload schema';
