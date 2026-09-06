-- supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql
--
-- DGII fase 2, parte 1 de 3: retirar el módulo fiscal viejo SIN borrarlo.
--
-- El módulo que DermaLand tenía nunca emitió un comprobante, ni al ambiente de
-- pruebas. Sus 13 tablas están vacías salvo `dgii_certificates` (4 filas, 3 de
-- ellas revocadas). Aun así no se borran: se renombran con la fecha de la
-- retirada. Se borran de verdad en una migración posterior, cuando el módulo
-- nuevo lleve tiempo funcionando.
--
-- Ocho de esos nombres los reutiliza el esquema nuevo (parte 2), así que este
-- renombrado es requisito para el siguiente fichero. La parte 2 lo comprueba en
-- vez de fiarse de que alguien lea esto.
--
-- MARCHA ATRÁS COMPLETA. Antes esta cabecera decía «volver atrás sea renombrar
-- de vuelta», y eso NO basta: se dejaba fuera las dos claves foráneas. Quien
-- hiciera la reversa obvia dejaría `proformas` y `cash_closing_sales` sin su
-- clave foránea PARA SIEMPRE Y EN SILENCIO (I3 de la revisión final). Los
-- cuatro pasos, en orden:
--
--   1) renombrar las 13 de vuelta (quitarles el sufijo _legacy_20260906);
--   2) soltar las FK que la parte 3 creó hacia la electronic_invoices NUEVA:
--        alter table public.proformas          drop constraint if exists proformas_electronic_invoice_fk;
--        alter table public.cash_closing_sales drop constraint if exists cash_closing_sales_electronic_invoice_fk;
--   3) recrearlas apuntando a la electronic_invoices restaurada, tal como
--      estaban en 0003_dgii_pos.sql:599-608:
--        alter table public.proformas
--          add constraint proformas_electronic_invoice_fk
--          foreign key (electronic_invoice_id) references public.electronic_invoices(id)
--          on delete set null deferrable initially deferred;
--        alter table public.cash_closing_sales
--          add constraint cash_closing_sales_electronic_invoice_fk
--          foreign key (electronic_invoice_id) references public.electronic_invoices(id)
--          on delete set null deferrable initially deferred;
--   4) borrar las 18 tablas nuevas y las 5 funciones.
--
-- Sin el paso 3, proformas y cash_closing_sales quedan SIN clave foránea y en
-- silencio. Hacia adelante no hay hueco: si se aplicó la 1 y no la 3, basta con
-- correr las partes 2 y 3, que son idempotentes y reconstruyen las dos FK.
--
-- Idempotente: cada renombrado comprueba con `to_regclass` que la tabla existe
-- con el nombre viejo y que el nombre nuevo está libre.

-- ── 1) Soltar las claves foráneas que salen de tablas VIVAS ──────────────────
-- `proformas` y `cash_closing_sales` se quedan; solo pierden el enganche, que se
-- vuelve a crear en la parte 3 apuntando a la tabla nueva. Sin esto, el
-- renombrado arrastraría la FK a la tabla legacy y las proformas nuevas
-- quedarían apuntando al módulo retirado.
alter table public.proformas
  drop constraint if exists proformas_electronic_invoice_fk;
alter table public.cash_closing_sales
  drop constraint if exists cash_closing_sales_electronic_invoice_fk;

-- ── 2) Renombrar las 13 ──────────────────────────────────────────────────────
do $$
declare
  t text;
  viejas text[] := array[
    'dgii_settings','dgii_certificates','ecf_sequences','electronic_invoices',
    'electronic_invoice_items','dgii_submissions','dgii_status_logs',
    'dgii_received_ecf','dgii_commercial_approvals','proforma_to_ecf_logs',
    'dgii_logs','ecf_document_events','cash_closing_ecf_items'
  ];
begin
  foreach t in array viejas loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public.' || t || '_legacy_20260906') is null then
      execute format('alter table public.%I rename to %I', t, t || '_legacy_20260906');
      raise notice 'retirada: % -> %_legacy_20260906', t, t;
    end if;
  end loop;
end $$;

-- Trece tablas expuestas cambian de nombre: PostgREST tiene que enterarse.
-- M4 de la revisión final.
notify pgrst, 'reload schema';
