/**
 * Guardas del simulacro de recuperacion (B-01).
 *
 * `assertSafeTarget` protege el DESTINO (no escribir donde no se debe) y
 * `diffFingerprints` compara dos huellas. Entre las dos queda un hueco que una
 * ronda de re-revision (2026-08-05) senalo, y que estas dos funciones cierran:
 *
 *   1. Nadie verificaba que ORIGEN y DESTINO fueran clusters distintos.
 *      `diffFingerprints(prod, prod)` devuelve `ok: true` — un simulacro
 *      apuntado dos veces a produccion se aprueba a si mismo y no prueba
 *      absolutamente nada. Se compara el `system_identifier` del cluster
 *      (pg_control_system()), que es unico por cluster e independiente del
 *      DSN: cambiar de host, de puerto o de usuario no lo altera, asi que
 *      no se puede burlar escribiendo la misma base de dos maneras.
 *
 *   2. `diffFingerprints` ya rechaza huellas de produccion DEGENERADAS
 *      (dimension vacia o ausente), pero una huella SIMBOLICA — una tabla,
 *      una politica — la pasa: no esta vacia. Y contra una huella simbolica
 *      "no falta nada" se cumple trivialmente. Hace falta un piso de
 *      MAGNITUD, no solo de presencia.
 *
 * Ambas lanzan; no devuelven banderas. Un simulacro que sigue adelante con
 * una advertencia impresa es un simulacro que alguien va a leer como
 * aprobado.
 *
 * Se mantienen PURAS (no leen disco, no abren conexiones) para que sus
 * pruebas unitarias sean deterministas, igual que assert-safe-target.mjs.
 */

/**
 * Piso de magnitud por defecto, deliberadamente por DEBAJO de la realidad
 * medida el 2026-08-05 contra produccion (86 tablas rastreadas — 83 en
 * `public` + auth.users + storage.buckets + storage.objects — y 106
 * politicas RLS: 101 en `public` + 5 en storage.objects). El margen existe
 * para que borrar una tabla legitima no rompa el simulacro, pero cualquier
 * huella simbolica o truncada queda fuera por goleada.
 */
export const MIN_TABLAS = 80;
export const MIN_POLITICAS = 100;

/** Normaliza el identificador de cluster a texto comparable. */
function sysid(identidad) {
  if (identidad === null || typeof identidad !== "object") return null;
  const v = identidad.sysid;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Exige que el cluster de ORIGEN (produccion) y el de DESTINO (el arenero)
 * sean distintos. Lanza si son el mismo, o si la identidad de cualquiera de
 * los dos no se pudo establecer: comparar a ciegas es peor que no comparar.
 *
 * @param {{ origen: unknown, destino: unknown }} args
 */
export function assertOrigenDistinto({ origen, destino }) {
  const a = sysid(origen);
  const b = sysid(destino);

  if (a === null || b === null) {
    const cual = a === null && b === null ? "origen y destino" : a === null ? "el origen" : "el destino";
    throw new Error(
      `ABORTADO: no se pudo establecer la identidad del cluster de ${cual} ` +
        "(system_identifier vacio o ausente). Sin identidad no hay forma de probar que se comparan " +
        "dos bases distintas, y un simulacro que se compara consigo mismo aprueba siempre.",
    );
  }

  if (a === b) {
    throw new Error(
      `ABORTADO: origen y destino son el MISMO cluster (system_identifier ${a}). ` +
        "Comparar produccion contra si misma da 'todo cuadra' sin haber restaurado nada. " +
        "Revisa a que base apunta el arenero.",
    );
  }
}

/** Suma numerica tolerante de los valores de un objeto. */
function suma(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return 0;
  return Object.values(obj).reduce((acc, v) => {
    const n = Number(v);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * Exige que la huella de produccion tenga una magnitud CREIBLE antes de dar
 * por bueno el simulacro. `diffFingerprints` ya rechaza lo vacio; esto
 * rechaza lo simbolico.
 *
 * @param {unknown} prod huella de produccion ya parseada
 * @param {{ minTablas?: number, minPoliticas?: number }} [opts]
 */
export function assertMagnitudCreible(prod, { minTablas = MIN_TABLAS, minPoliticas = MIN_POLITICAS } = {}) {
  if (prod === null || typeof prod !== "object" || Array.isArray(prod)) {
    throw new Error(
      "ABORTADO: la huella de produccion no es un objeto. No hay nada que medir — " +
        "revisa que la consulta se haya ejecutado y su JSON se haya parseado.",
    );
  }

  const filas = prod.filas;
  const tablas =
    filas !== null && typeof filas === "object" && !Array.isArray(filas) ? Object.keys(filas).length : 0;
  const politicas = suma(prod.politicas);

  const faltas = [];
  if (tablas < minTablas) {
    faltas.push(`solo ${tablas} tablas rastreadas (minimo creible: ${minTablas})`);
  }
  if (politicas < minPoliticas) {
    faltas.push(`solo ${politicas} politicas RLS (minimo creible: ${minPoliticas})`);
  }

  if (faltas.length > 0) {
    throw new Error(
      `ABORTADO: la huella de produccion es demasiado pequena para ser real — ${faltas.join(" y ")}. ` +
        "DermaLand en produccion tiene 86 tablas rastreadas y 106 politicas. Una huella asi de corta " +
        "significa que la consulta no vio el esquema real (DSN equivocado, permisos, base a medio " +
        "restaurar): contra ella 'no falta nada' se cumple sin haber probado nada.",
    );
  }

  return { tablas, politicas };
}
