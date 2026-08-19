-- Quién cerró la caja, CON NOMBRE, igual que opened_by_name: el ticket del
-- cierre lo imprime y un uuid no le dice nada a quien revisa el arqueo.
-- Las sesiones ya cerradas quedan sin nombre (no se inventa hacia atrás).
alter table public.cash_register_sessions
  add column if not exists closed_by_name text;
