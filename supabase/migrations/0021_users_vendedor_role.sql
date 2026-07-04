-- =============================================================================
-- DermaLand · Rol "vendedor" + alta de personal desde la app
-- =============================================================================
-- Aditiva, NO destructiva.
--  1. Amplía el CHECK de `users.role` para incluir 'vendedor' (personal que
--     vende y genera incentivos, sin necesariamente tener login).
--  2. Da default gen_random_uuid() a `users.id` para poder crear registros de
--     personal que NO corresponden a una cuenta de auth (atribución de
--     ventas/incentivos). El login sigue gestionándose por Supabase Auth
--     aparte; estos registros son un directorio de personal.
-- NO toca DGII real.

alter table users
  drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check check (role in
    ('admin','manager','cashier','inventory','supervisor','auditor','vendedor'));

alter table users
  alter column id set default gen_random_uuid();

notify pgrst, 'reload schema';
