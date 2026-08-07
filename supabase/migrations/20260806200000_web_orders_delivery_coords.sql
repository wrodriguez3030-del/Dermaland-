-- Coordenadas de entrega: el cliente comparte su ubicación desde el navegador.
--
-- POR QUÉ, y por qué DOS columnas y no un texto
--
-- En Santiago hay calles sin número y sectores donde "la casa verde al lado del
-- colmado" es la dirección real. El repartidor se pierde y llama. Un punto en el
-- mapa lo resuelve sin depender de cómo de bien escriba cada cliente.
--
-- Se guardan como `numeric` separadas y NO como texto ni como un enlace de
-- Google Maps: el enlace se construye al mostrarlo, así que el dato sigue
-- sirviendo si mañana se cambia de proveedor de mapas, y un número se puede
-- validar (un texto pegado no).
--
-- AMBAS COLUMNAS SON OPCIONALES. Compartir la ubicación es voluntario: el
-- navegador pide permiso y mucha gente lo niega, con razón. La dirección escrita
-- sigue siendo obligatoria y el pedido se completa igual sin coordenadas.
--
-- Precisión: `numeric(9,6)` da ~11 cm, de sobra para encontrar una puerta.

alter table web_orders
  add column if not exists delivery_lat numeric(9,6),
  add column if not exists delivery_lng numeric(9,6);

-- Rango válido de coordenadas terrestres. Una latitud de 200 no es una casa mal
-- ubicada: es un dato corrupto, y vale más que la base lo rechace a que el
-- repartidor lo descubra.
alter table web_orders
  drop constraint if exists web_orders_delivery_coords_check;

alter table web_orders
  add constraint web_orders_delivery_coords_check check (
    (delivery_lat is null and delivery_lng is null)
    or (
      delivery_lat between -90 and 90
      and delivery_lng between -180 and 180
    )
  );

comment on column web_orders.delivery_lat is
  'Latitud que el cliente compartió desde el navegador. Opcional: compartir la ubicación es voluntario.';
comment on column web_orders.delivery_lng is
  'Longitud que el cliente compartió desde el navegador. Opcional; siempre acompaña a delivery_lat.';
