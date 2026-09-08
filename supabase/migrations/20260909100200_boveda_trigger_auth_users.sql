-- La bóveda se marca «desincronizada» si la clave cambia por fuera del panel.
--
-- Va en un fichero APARTE de 20260909100000 porque `apply-migration.mjs`
-- envuelve cada fichero en begin/commit: si crear un trigger sobre `auth.users`
-- fallara por permisos, no arrastraría a las tablas de la otra migración.
-- Sin este trigger el sistema sigue funcionando: la ruta de asignar clave pone
-- `stale=false` y `scripts/reset-admin-password.mjs` pone `stale=true` a mano.

create or replace function public.vault_marcar_desincronizada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.user_password_vault set stale = true where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists vault_clave_cambiada on auth.users;
create trigger vault_clave_cambiada
  after update of encrypted_password on auth.users
  for each row execute function public.vault_marcar_desincronizada();
