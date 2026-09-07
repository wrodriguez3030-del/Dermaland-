-- La configuración de facturación se guarda EN LA BASE, no en el navegador.
--
-- 🔴 El fallo: `features/billing/billing-settings-store.ts` decía en su primera
-- línea «MVP (localStorage)» y era literal — la tabla `billing_settings` existe
-- desde la migración 0014 y estaba VACÍA. Lo que el dueño elegía en
-- «DGII / Facturación → Configuración» vivía solo en ese navegador:
--
--   · desde otra computadora, o tras borrar datos del sitio, volvía a los
--     valores por defecto sin avisar;
--   · el SERVIDOR nunca se enteraba, así que cualquier decisión de facturación
--     tomada del lado del servidor usaba el valor por defecto, no el elegido;
--   · y la pantalla decía «Configuración guardada», que era cierto y engañoso a
--     la vez.
--
-- Esta migración solo añade la columna que le faltaba a la tabla para poder
-- guardar la configuración completa. El resto ya estaba: RLS por negocio, el
-- UNIQUE por `business_id`, y los CHECK que impiden un ambiente inventado o
-- activar la emisión real fuera de producción.
--
-- Lo que NO cambia, y conviene dejar dicho: cada factura ya guarda SU copia del
-- tipo con el que se emitió (`proformas.billing_type`, `document_kind`,
-- `ecf_type`, `sequence_type`, `sequence_environment`, `ecf_number`). Cambiar
-- esta configuración mañana no reescribe ni una factura de ayer. Y las migradas
-- de Alegra conservan su NCF y su prefijo, que son de solo lectura.

alter table public.billing_settings
  add column if not exists default_customer_billing_type text not null default 'consumo';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.billing_settings'::regclass
       and conname = 'billing_settings_default_customer_billing_type_check'
  ) then
    alter table public.billing_settings
      add constraint billing_settings_default_customer_billing_type_check
      check (default_customer_billing_type in ('consumo', 'credito_fiscal'));
  end if;
end $$;

comment on column public.billing_settings.default_customer_billing_type is
  'Tipo de facturación que trae por defecto el formulario de un cliente NUEVO. No afecta a los clientes ya creados ni a las facturas ya emitidas.';

notify pgrst, 'reload schema';
