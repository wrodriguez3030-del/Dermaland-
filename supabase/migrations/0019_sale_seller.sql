-- =============================================================================
-- DermaLand · Vendedor responsable de la venta (base de incentivos)
-- =============================================================================
-- Aditiva, NO destructiva. Separa el VENDEDOR (quien gestiona la venta, para
-- incentivos/comisiones) del CAJERO (quien cobra, ya en cashier_id/name).
--   - seller_id: FK a users (relación principal por id).
--   - seller_name: snapshot para historial si el usuario cambia de nombre o
--     queda inactivo.
-- Ventas viejas quedan con seller_id NULL → la UI muestra "No asignado".
-- NO toca DGII real.

alter table proformas
  add column if not exists seller_id uuid references users(id),
  add column if not exists seller_name text;

comment on column proformas.seller_id is
  'Vendedor responsable de la venta (users.id) — base para incentivos. NULL en ventas previas.';
comment on column proformas.seller_name is
  'Snapshot del nombre del vendedor al momento de la venta.';

create index if not exists proformas_seller_idx
  on proformas (business_id, seller_id);

notify pgrst, 'reload schema';
