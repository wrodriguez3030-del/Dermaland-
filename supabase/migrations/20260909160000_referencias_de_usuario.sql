-- ¿Qué se llevaría por delante borrar a una persona?
--
-- 🔴 POR QUÉ EXISTE. Las claves foráneas que apuntan a `public.users` NO son
-- todas iguales, y las peligrosas son las silenciosas:
--
--   · `alegra_invoices.seller_id`  → ON DELETE **SET NULL**. Borrar a Desteny
--     dejaría 5 551 facturas SIN VENDEDOR, sin un solo error. Las comisiones y
--     el desglose por vendedor cambiarían de golpe y nadie sabría por qué.
--   · `audit_logs.user_id`         → ON DELETE **SET NULL**. Borrar a alguien
--     ANONIMIZA todo su rastro de auditoría. Justo lo contrario de auditar.
--   · `branches.default_seller_id`, `dgii_certificates.uploaded_by`,
--     `security_settings.updated_by` → lo mismo.
--
-- El resto (proformas, cajas, inventario, incentivos…) son NO ACTION: ahí el
-- borrado falla con un error feo de base de datos, que al menos se nota.
--
-- Esta función cuenta lo que quedaría COLGANDO para que la aplicación pueda
-- negarse ANTES y decir por qué: a quien tiene historial se le DESACTIVA, no se
-- le borra. Solo se puede borrar a quien no dejó rastro (un alta equivocada,
-- una prueba).
--
-- QUÉ CUENTA Y QUÉ NO
-- ───────────────────
-- Recorre el catálogo, así que una tabla nueva con una FK a `users` entra sola
-- —enumerarlas a mano sería una lista que se queda vieja en silencio—.
--
-- NO cuenta las filas que se van CON la persona (`ON DELETE CASCADE`: sus
-- dispositivos de confianza y su clave guardada). Esas son suyas y desaparecer
-- con ella es lo correcto. Y para no contarlas por la puerta de atrás, una fila
-- que va a caer por cascada tampoco cuenta por sus otras columnas: la clave que
-- alguien se puso a sí mismo tiene `user_id` y `set_by` con el mismo id.
--
-- `security invoker`: la llama el servidor con service_role, que es quien puede
-- mirar todas las tablas. Sin `security definer` no hay función privilegiada
-- que alguien pueda usar para contar filas ajenas.

create or replace function public.referencias_de_usuario(p_user_id uuid)
returns table (tabla text, columna text, filas bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  r record;
  cascadas text[];
  filtro text;
  n bigint;
begin
  for r in
    select con.conrelid::regclass::text as tabla,
           a.attname::text              as columna,
           con.confdeltype              as al_borrar
    from pg_constraint con
    join unnest(con.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.users'::regclass
      and con.confdeltype <> 'c'          -- las de cascada se van con la persona
    order by 1, 2
  loop
    -- Las columnas de ESTA tabla que harían caer la fila por cascada. Si alguna
    -- apunta a la misma persona, la fila desaparece: no cuenta como huérfana.
    select coalesce(array_agg(a2.attname::text), '{}')
      into cascadas
    from pg_constraint c2
    join unnest(c2.conkey) with ordinality k2(attnum, ord) on true
    join pg_attribute a2 on a2.attrelid = c2.conrelid and a2.attnum = k2.attnum
    where c2.contype = 'f'
      and c2.confrelid = 'public.users'::regclass
      and c2.confdeltype = 'c'
      and c2.conrelid = r.tabla::regclass;

    filtro := '';
    if array_length(cascadas, 1) is not null then
      select string_agg(format(' and (%I is null or %I <> $1)', c, c), '')
        into filtro
      from unnest(cascadas) as c;
    end if;

    execute format('select count(*) from %s where %I = $1%s', r.tabla, r.columna, coalesce(filtro, ''))
      into n
      using p_user_id;

    if n > 0 then
      tabla := r.tabla;
      columna := r.columna;
      filas := n;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.referencias_de_usuario(uuid) from public, anon;
grant execute on function public.referencias_de_usuario(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
