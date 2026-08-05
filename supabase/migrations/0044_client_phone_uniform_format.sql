-- 0044 — Un solo formato de teléfono en las fichas de cliente.
--
-- La lista de clientes parecía dos sistemas distintos: el mostrador escribía
-- `829-714-1975` y la tienda guardaba `8297141975`. Buscar ya funciona en los
-- dos casos desde la 0042 (columnas normalizadas), pero LEER seguía siendo un
-- desastre, y un mismo número escrito de dos formas hace dudar de si son la
-- misma persona — que es exactamente lo que pasó.
--
-- Se toca solo lo que son 10 dígitos limpios. Un número extranjero o una
-- extensión son datos reales y perderlos por no encajar en un formato
-- dominicano sería peor que el formato desparejo.
--
-- A partir de aquí lo garantiza el código: `customerRepository.create/update`
-- normaliza en la única puerta por la que pasa todo lo que se guarda.

begin;

update public.clients
   set phone = case
         when phone_digits is null then null
         when length(phone_digits) = 10
           then left(phone_digits,3)||'-'||substr(phone_digits,4,3)||'-'||right(phone_digits,4)
         else phone
       end,
       whatsapp = case
         when whatsapp_digits is null then null
         when length(whatsapp_digits) = 10
           then left(whatsapp_digits,3)||'-'||substr(whatsapp_digits,4,3)||'-'||right(whatsapp_digits,4)
         else whatsapp
       end,
       updated_at = now()
 where phone_digits is not null or whatsapp_digits is not null;

-- La cadena vacía y "no tiene" son la misma cosa. Guardarlas distinto obliga a
-- distinguirlas en cada pantalla que las lea.
update public.clients set phone    = null where btrim(coalesce(phone,''))    = '' and phone    is not null;
update public.clients set whatsapp = null where btrim(coalesce(whatsapp,'')) = '' and whatsapp is not null;
update public.clients set email    = null where btrim(coalesce(email,''))    = '' and email    is not null;

commit;
