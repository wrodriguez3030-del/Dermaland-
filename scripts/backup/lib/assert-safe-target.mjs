/**
 * Guarda de destino: deny-by-default.
 *
 * El dump de DermaLand puede generarse en modo destructivo (`--with-drop`), y
 * el servidor de recuperacion aloja ademas la produccion de csl-app y el stack
 * de PalusaApp. Un destino mal escrito no ensucia una base: la vacia. Es el
 * modo de falla del incidente de Neon, y esta guarda existe para que no se
 * repita.
 *
 * Ante cualquier duda, aborta. Un simulacro que no corre cuesta minutos; una
 * restauracion sobre datos ajenos cuesta el negocio de otro.
 *
 * La huella de tablas propias de DermaLand YA NO se mantiene a mano aqui
 * (ronda de correccion 1, 2026-08-05): la version anterior tenia 16 de las 83
 * tablas reales de produccion, y 4 de esos 16 nombres ni siquiera existian
 * (`sales`, `sale_items`, `categories`, `cash_sessions`). Un restore real
 * habria abortado siempre por "tablas desconocidas" — falla del lado seguro,
 * pero deja el flujo inservible, y una guarda que estorba siempre termina
 * desactivada por alguien con prisa. Ahora se recibe como parametro
 * `footprint` (Set o array), construido por quien llama a partir de las
 * migraciones reales — ver lib/dermaland-footprint.mjs. Esta funcion se
 * mantiene deliberadamente PURA (no lee disco) para que sus pruebas sigan
 * siendo deterministas: si no se provee `footprint`, deny-by-default aplica
 * con huella vacia (ninguna tabla se reconoce), nunca con una lista
 * hardcodeada que alguien pueda olvidar actualizar.
 */

/** Prefijos de otros inquilinos que conviven en supabase-01. */
const PREFIJOS_AJENOS = [/^csl_/, /^palusa/, /^maintenance_/, /^material_/];

export function assertSafeTarget({ tables, confirm, isProduction, footprint }) {
  if (isProduction) {
    throw new Error(
      "ABORTADO: el destino es el proyecto de PRODUCCION. El simulacro nunca escribe en produccion.",
    );
  }

  if (!confirm) {
    throw new Error(
      "ABORTADO: falta DERMALAND_DR_CONFIRM. Exportala para confirmar que el destino es desechable.",
    );
  }

  const lista = tables ?? [];
  const ajenas = lista.filter((t) => PREFIJOS_AJENOS.some((re) => re.test(t)));
  if (ajenas.length) {
    throw new Error(
      `ABORTADO: el destino contiene tablas de OTRO inquilino (${ajenas.join(", ")}). ` +
        "Escribir aqui destruiria datos ajenos.",
    );
  }

  // Deny-by-default: sin `footprint` explicito, no se reconoce NINGUNA
  // tabla (huella vacia) — cualquier tabla presente en el destino aborta.
  const huella = footprint instanceof Set ? footprint : new Set(footprint ?? []);
  const desconocidas = lista.filter((t) => !huella.has(t));
  if (desconocidas.length) {
    throw new Error(
      `ABORTADO: el destino contiene tablas desconocidas (${desconocidas.slice(0, 5).join(", ")}). ` +
        "La guarda es deny-by-default: si no reconoce el destino, no escribe.",
    );
  }
}
