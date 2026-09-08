-- El resumen y VARIOS desgloses del panel en UNA sola llamada.
--
-- POR QUÉ
-- ───────
-- El panel pide, con exactamente los mismos filtros: el resumen (1 llamada),
-- tres desgloses (3 llamadas) y el listado (2 consultas). Seis viajes a la base
-- por cada carga de la pantalla.
--
-- Medido el 08/09/2026 contra esta misma base (14 973 facturas · 31 222
-- líneas):
--
--   una sola llamada, en caliente ......  70–145 ms de base
--   las cinco EN PARALELO ..............  412 ms de reloj
--
-- Cinco consultas que juntas leen ~46 000 filas no pueden costar 412 ms de
-- trabajo: el escaneo de tablas de este tamaño se mide en decenas de
-- milisegundos. Lo que cuesta es CADA VIAJE — conexión del pooler, PostgREST,
-- planificación— y encima se estorban entre ellos. Con `Server-Timing` en
-- producción, ese tramo salía en 653 ms en caliente y 3 883 ms en frío.
--
-- QUÉ HACE Y QUÉ NO
-- ─────────────────
-- 🔴 NO recalcula NADA. Llama a `resumen_ventas_unificadas` y a
-- `desglose_ventas_unificadas` —las mismas funciones que ya usa el panel, con
-- los mismos parámetros— y devuelve sus resultados juntos en un `jsonb`. Es
-- imposible que dé un número distinto del que daban por separado, que es
-- justamente lo que hacía peligrosa la otra forma de arreglarlo (reescribir la
-- agregación en una sola pasada).
--
-- Lo único que cambia es cuántas veces se cruza la red.
--
-- `security invoker`: la RLS de las tablas de abajo sigue mandando, y las dos
-- funciones que llama ya son `security invoker` también. Un usuario no puede
-- ver por esta puerta nada que no viera por las otras dos.
--
-- FORMA DE LA RESPUESTA
-- ─────────────────────
--   {
--     "resumen":   { sistema_total: …, alegra_total: …, … },   -- la fila tal cual
--     "desgloses": { "sucursal": [ {clave, etiqueta, origen, cantidad, total}, … ],
--                    "forma_pago": [ … ] }
--   }
--
-- `p_con_resumen` en false deja `resumen` en `null` y NO lo calcula: la pantalla
-- de Reportes pide cinco desgloses y ningún resumen, y calcularlo igual sería
-- un escaneo entero de balde.
--
-- Una dimensión sin filas sale como `[]`, NUNCA ausente: la diferencia entre
-- «no hubo ventas» y «esta dimensión no vino» tiene que poder distinguirse en
-- la pantalla, y con la clave ausente no se distingue.
--
-- `p_dimensiones` vacío devuelve `desgloses: {}` — el resumen solo.

create or replace function public.panel_ventas_unificadas(
  p_business_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cliente_id uuid default null,
  p_sucursal_id uuid default null,
  p_dimensiones text[] default '{}'::text[],
  p_con_resumen boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'resumen',
    case when p_con_resumen then (
      select to_jsonb(r)
      from public.resumen_ventas_unificadas(
        p_business_id, p_desde, p_hasta, p_cliente_id, p_sucursal_id
      ) r
    ) end,
    'desgloses',
    coalesce(
      (
        select jsonb_object_agg(t.dim, t.filas)
        from (
          select
            d.dim,
            coalesce(
              (
                select jsonb_agg(to_jsonb(x))
                from public.desglose_ventas_unificadas(
                  p_business_id, p_desde, p_hasta, p_cliente_id, p_sucursal_id, d.dim
                ) x
              ),
              '[]'::jsonb
            ) as filas
          -- `distinct`: pedir dos veces la misma dimensión no puede reventar el
          -- `jsonb_object_agg` con una clave repetida.
          from (select distinct unnest(p_dimensiones) as dim) d
        ) t
      ),
      '{}'::jsonb
    )
  );
$$;

-- Mismos permisos que las dos funciones que envuelve: si esta fuera más
-- abierta, sería una puerta de atrás a lo que ellas protegen.
revoke execute on function public.panel_ventas_unificadas(uuid, date, date, uuid, uuid, text[], boolean) from public, anon;
grant execute on function public.panel_ventas_unificadas(uuid, date, date, uuid, uuid, text[], boolean) to authenticated;

notify pgrst, 'reload schema';
