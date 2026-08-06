/**
 * Lista las tablas expuestas por el proyecto Supabase/PostgREST DESTINO, para
 * que assert-safe-target.mjs pueda decidir si es seguro escribir ahi.
 *
 * No existe una funcion `pg_tables_public` en ningun proyecto Supabase de
 * este stack (se propuso en el plan original de la Tarea 4 y era incorrecta:
 * no se transcribio). El mecanismo real y documentado es el endpoint raiz de
 * PostgREST: `GET {url}/rest/v1/` devuelve el spec OpenAPI que PostgREST
 * genera automaticamente; su objeto `definitions` trae como claves los
 * nombres de tabla/vista expuestos. Verificado 2026-08-05 contra produccion
 * (sntcvyozbhrgicwmtcoh): con la service_role key devuelve un spec con las
 * 83 tablas reales.
 *
 * Ronda de correccion 1 encontro que, si esta llamada fallaba (red, permisos,
 * formato inesperado — por ejemplo un gateway self-hosted que responda
 * distinto al de Supabase Cloud, que es el unico probado), el script caia en
 * silencio a lista vacia. La guarda seguia exigiendo DERMALAND_DR_CONFIRM
 * (nunca asumio "destino vacio = seguro"), pero quien opera no podia
 * distinguir "el destino esta genuinamente vacio" de "el chequeo de
 * contenido no llego a correr y solo la confirmacion manual protege". Esta
 * version avisa por stderr en TODOS los casos en que el chequeo no corrio,
 * y se queda en silencio SOLO cuando corrio y confirmo que no hay tablas.
 *
 * ─── Que devuelve exactamente, y por que importa ─────────────────────────────
 * `definitions` trae TABLAS Y VISTAS, no solo tablas. Medido contra produccion
 * el 2026-08-06: 84 claves = 83 tablas + la vista `inventory_stock_by_lot`.
 *
 * Aqui NO se filtran las vistas, y es a proposito: desde el spec no se
 * distinguen de forma fiable (`inventory_stock_by_lot` es auto-actualizable,
 * asi que PostgREST le publica POST/PATCH/DELETE igual que a una tabla). El
 * criterio compartido vive en lib/dermaland-footprint.mjs
 * (`CLASES_DE_RELACION`), que reconoce tablas y vistas; el otro llamador de la
 * guarda —dr-drill.mjs— lista su destino con `sqlRelacionesDelDestino()`, que
 * sale de la MISMA lista. Cuando los dos lados no coincidian, la restauracion
 * legitima abortaba siempre acusando al destino de estar contaminado.
 */

/**
 * @param {{ url: string, key: string, fetchImpl?: typeof fetch, warn?: (msg: string) => void }} args
 * @returns {Promise<string[]>}
 */
export async function listTargetTables({ url, key, fetchImpl = fetch, warn = (msg) => console.error(msg) }) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/`;

  const avisar = (motivo) => {
    warn(
      `⚠️  No se pudo inspeccionar el contenido del destino (${motivo}, endpoint: ${endpoint}). ` +
        "La guarda sigue activa SOLO por la confirmacion manual (DERMALAND_DR_CONFIRM); " +
        "NO se verifico si el destino tiene tablas de otro inquilino.",
    );
  };

  let res;
  try {
    res = await fetchImpl(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch (e) {
    avisar(`error de red: ${e.message}`);
    return [];
  }

  if (!res.ok) {
    avisar(`HTTP ${res.status}`);
    return [];
  }

  let spec;
  try {
    spec = await res.json();
  } catch (e) {
    avisar(`respuesta no es JSON: ${e.message}`);
    return [];
  }

  const definiciones = spec?.definitions;
  if (!definiciones || typeof definiciones !== "object") {
    avisar('respuesta sin el formato OpenAPI esperado (falta "definitions")');
    return [];
  }

  // Chequeo corrio y respondio: si no hay tablas, el destino esta
  // genuinamente vacio. Silencioso a proposito — no es una falla.
  return Object.keys(definiciones);
}
