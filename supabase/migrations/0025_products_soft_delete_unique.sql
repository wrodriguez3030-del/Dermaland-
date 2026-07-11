-- 0025_products_soft_delete_unique.sql — Unicidad de productos consciente del
-- soft-delete. Un producto ELIMINADO (deleted_at IS NOT NULL) ya no reserva su
-- SKU ni su código de barra: un producto VIVO puede reutilizarlos.
--
-- Corrige el falso "duplicado" al editar un producto y asignarle un SKU/barcode
-- que solo tenía un producto borrado. Aditiva, no destructiva, backward-compatible.
-- Auditado antes de aplicar: 0 duplicados entre productos vivos (deleted_at IS NULL).
-- Aplicada por MCP al proyecto sntcvyozbhrgicwmtcoh (2026-07-10). NO toca DGII real.

-- SKU: era CONSTRAINT global (contaba borrados) → índice único parcial sobre vivos.
alter table products drop constraint if exists products_business_id_sku_key;
create unique index if not exists products_business_sku_live_unique
  on products (business_id, sku)
  where deleted_at is null;

-- Barcode: el índice parcial no excluía borrados → recrear excluyéndolos.
drop index if exists products_barcode_unique;
create unique index if not exists products_barcode_live_unique
  on products (business_id, barcode)
  where barcode is not null and deleted_at is null;

notify pgrst, 'reload schema';
