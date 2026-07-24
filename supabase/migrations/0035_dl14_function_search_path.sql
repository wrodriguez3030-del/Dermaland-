-- DL-14 (auditoría de seguridad 2026-07-24): fijar `search_path` en las funciones
-- RPC marcadas por el advisor `function_search_path_mutable`.
--
-- Son SECURITY INVOKER (se ejecutan con privilegios del invocador y la RLS sigue
-- aplicando dentro de ellas), así que no hay escalada; esto es endurecimiento
-- best-practice contra el patrón de hijacking de `search_path`. Idempotente:
-- itera por nombre (cubre cualquier overload) y no falla si alguna no existe.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'emit_sale_atomic',
        'void_sale_atomic',
        'apply_count_adjustments',
        'transfer_stock_atomic'
      )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
