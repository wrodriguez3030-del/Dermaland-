-- Ata cada factura migrada de Alegra a un vendedor del sistema.
--
-- Alegra guarda el vendedor como texto libre (`seller_name`). Para que los
-- reportes por vendedor y los incentivos funcionen hace falta el enlace real
-- al usuario, no una comparación de cadenas en cada consulta.
--
-- La columna la escribe UNA VEZ el guion `scripts/alegra/vincular-vendedores.mjs`.
-- El sincronizador diario NO la toca: su upsert usa `merge-duplicates`, que solo
-- pisa las columnas que envía, y ésta no va en el payload. Así una factura
-- re-sincronizada conserva su vendedor.
--
-- `seller_name` se queda como está: es el dato tal como vino de Alegra y es la
-- prueba de dónde salió el enlace.

alter table public.alegra_invoices
  add column if not exists seller_id uuid references public.users(id) on delete set null;

comment on column public.alegra_invoices.seller_id is
  'Vendedor del sistema al que se atribuye esta factura migrada. Lo escribe el guion de vinculación, no el sincronizador.';

create index if not exists alegra_invoices_seller
  on public.alegra_invoices (business_id, seller_id)
  where seller_id is not null;

notify pgrst, 'reload schema';
