-- Una comisión puede nacer de una venta del sistema O de una factura migrada.
--
-- Por qué: `sales_incentives.sale_id` era NOT NULL y apuntaba a `proformas`, la
-- tabla del punto de venta EN VIVO. El dueño decidió comisionar el histórico
-- migrado de Alegra desde mayo de 2026, y la única forma de meterlo tal como
-- estaba la tabla habría sido insertar proformas falsas: ventas fantasma en la
-- caja, que es la línea roja de este proyecto.
--
-- 🔴 Por qué se amplía ESTA tabla en vez de crear otra para el histórico: el
-- informe de comisiones, los lotes de pago y la auditoría leen de aquí. Una
-- segunda tabla sería una segunda definición de «lo que se le debe a alguien», y
-- este proyecto ya se ha quemado teniendo varias definiciones del mismo número.
-- Una comisión es una comisión venga de donde venga; lo que cambia es de qué
-- venta cuelga.
--
-- El CHECK obliga a que sea exactamente UNA de las dos. Ni ninguna (una comisión
-- sin venta no se puede auditar) ni las dos (no se sabría cuál manda).

alter table public.sales_incentives
  alter column sale_id drop not null,
  add column if not exists alegra_invoice_id uuid references public.alegra_invoices(id) on delete restrict;

comment on column public.sales_incentives.alegra_invoice_id is
  'Factura migrada de Alegra de la que nace esta comisión. Excluyente con `sale_id`: una comisión cuelga de una venta del sistema o de una migrada, nunca de las dos.';

-- `on delete restrict` a propósito: si alguien intentara borrar una factura
-- migrada que ya generó comisión, la base se niega. Alegra manda y no se borra,
-- pero una comisión huérfana sería dinero sin justificante.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sales_incentives'::regclass
       and conname = 'sales_incentives_una_venta_check'
  ) then
    alter table public.sales_incentives
      add constraint sales_incentives_una_venta_check
      check (num_nonnulls(sale_id, alegra_invoice_id) = 1);
  end if;
end $$;

-- Una factura migrada no puede generar dos veces la misma comisión. El índice
-- del sistema (`sale_id, rule_id, product_id`) no cubre estas filas porque su
-- `sale_id` es nulo, y en Postgres los nulos no chocan entre sí: sin esto,
-- correr el guion dos veces pagaría dos veces.
create unique index if not exists sales_incentives_alegra_regla_uniq
  on public.sales_incentives (alegra_invoice_id, rule_id)
  where alegra_invoice_id is not null;

create index if not exists sales_incentives_alegra_idx
  on public.sales_incentives (alegra_invoice_id)
  where alegra_invoice_id is not null;

notify pgrst, 'reload schema';
