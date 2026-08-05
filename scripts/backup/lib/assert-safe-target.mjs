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
 */

/** Tablas que DermaLand reconoce como suyas (muestra, no lista completa). */
const HUELLA_DERMALAND = new Set([
  "businesses", "branches", "users", "clients", "products", "product_lots",
  "sales", "sale_items", "proformas", "inventory_movements", "audit_logs",
  "laboratories", "brands", "categories", "cash_sessions", "payments",
]);

/** Prefijos de otros inquilinos que conviven en supabase-01. */
const PREFIJOS_AJENOS = [/^csl_/, /^palusa/, /^maintenance_/, /^material_/];

export function assertSafeTarget({ tables, confirm, isProduction }) {
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

  const desconocidas = lista.filter((t) => !HUELLA_DERMALAND.has(t));
  if (desconocidas.length) {
    throw new Error(
      `ABORTADO: el destino contiene tablas desconocidas (${desconocidas.slice(0, 5).join(", ")}). ` +
        "La guarda es deny-by-default: si no reconoce el destino, no escribe.",
    );
  }
}
