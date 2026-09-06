-- supabase/migrations/20260906090000_dgii_fase2_retirada_legacy.sql
--
-- DGII fase 2, parte 1 de 3: retirar el módulo fiscal viejo SIN borrarlo.
--
-- El módulo que DermaLand tenía nunca emitió un comprobante, ni al ambiente de
-- pruebas. Sus 13 tablas están vacías salvo `dgii_certificates` (4 filas, 3 de
-- ellas revocadas). Aun así no se borran: se renombran con la fecha de la
-- retirada, de modo que volver atrás sea renombrar de vuelta. Se borran de
-- verdad en una migración posterior, cuando el módulo nuevo lleve tiempo
-- funcionando.
--
-- Siete de esos nombres los reutiliza el módulo nuevo (parte 2), así que este
-- renombrado es requisito para el siguiente fichero.
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
