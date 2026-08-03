// Slugs de la tienda en línea: el identificador PÚBLICO de un producto.
//
// Dos reglas de negocio, no de estilo:
//
// 1. ESTABILIDAD. El slug se calcula UNA sola vez, al publicar, y se guarda en
//    `product_web_meta.slug`. Renombrar el producto en el catálogo NO lo
//    regenera: si lo hiciera, cada corrección de nombre rompería los enlaces
//    compartidos por WhatsApp y la indexación en Google. Cambiarlo es una acción
//    explícita del administrador, avisada en la interfaz.
//
// 2. DETERMINISMO ante colisión. El desempate usa 6 hexadecimales del id del
//    producto, no un contador. Un contador exige leer-y-escribir (carrera con
//    dos publicaciones simultáneas) y da un resultado distinto en cada
//    reejecución del sembrado, que debe ser idempotente.

/** Tope de la parte legible. La columna admite 80; el sufijo cabe siempre. */
export const SLUG_MAX_LENGTH = 60;

/** Longitud del desempate hexadecimal tomado del id. */
const SUFFIX_LENGTH = 6;

/** Cuando el nombre no aporta nada utilizable (símbolos, vacío). */
const FALLBACK_BASE = "producto";

/** Mínimo que exige el CHECK de la columna `product_web_meta.slug`. */
const SLUG_MIN_LENGTH = 3;

/**
 * Convierte un texto en un fragmento de URL: sin acentos, en minúsculas y con
 * guiones. Devuelve cadena vacía si no queda nada aprovechable.
 */
export function slugify(input: string): string {
  const base = (input ?? "")
    .normalize("NFD")
    // Marcas diacríticas: "é" ya separado en "e" + acento combinante.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length <= SLUG_MAX_LENGTH) return base;

  // Truncar por límite de palabra: cortar a mitad produce slugs ilegibles
  // ("proteccion-sola") que además envejecen mal en resultados de búsqueda.
  const cortado = base.slice(0, SLUG_MAX_LENGTH);
  const ultimoGuion = cortado.lastIndexOf("-");
  const recortado = ultimoGuion > 0 ? cortado.slice(0, ultimoGuion) : cortado;
  return recortado.replace(/-+$/, "");
}

/** Los 6 primeros hexadecimales del id, sin guiones. */
function suffixFor(productId: string): string {
  const hex = (productId ?? "").replace(/-/g, "").toLowerCase();
  return hex.slice(0, SUFFIX_LENGTH) || "000000";
}

/**
 * Slug definitivo de un producto. `usados` son los slugs ya emitidos para ese
 * mismo negocio; si el nombre choca, se desempata con el sufijo del id.
 *
 * Es una función pura: mismo nombre + mismo id + mismo conjunto → mismo slug.
 */
export function productSlug(
  name: string,
  productId: string,
  usados: ReadonlySet<string>,
): string {
  const base = slugify(name) || FALLBACK_BASE;
  const sufijo = suffixFor(productId);

  // Sin nombre utilizable el sufijo es obligatorio: "producto" a secas
  // colisionaría con cualquier otro producto sin nombre.
  if (base === FALLBACK_BASE) return `${base}-${sufijo}`;
  // Un nombre de una o dos letras ("Ñ", "K2") daría un slug que la base rechaza
  // por el CHECK de longitud mínima; el sufijo lo sube al mínimo exigido.
  if (base.length < SLUG_MIN_LENGTH) return `${base}-${sufijo}`;
  if (!usados.has(base)) return base;
  return `${base}-${sufijo}`;
}
