import { normalizeForSearch } from "@/features/storefront/catalog-query";
import { expandSearchTerm } from "@/features/storefront/synonyms";
import type { Product } from "@/types";

/**
 * Botones rápidos del POS: el cliente dice el problema ("tengo caspa"), el
 * cajero pulsa la tarjeta — no hace falta que sepa que eso es "Kelual" o
 * "Anticaspa". Reutiliza el mismo mapa de sinónimos que ya resuelve esto en
 * la tienda en línea (`synonyms.ts`): un producto nunca se llama "acné", se
 * llama "Cleanance".
 */
export interface CondicionPOS {
  key: string;
  label: string;
  /** Se expanden con `expandSearchTerm`; un producto entra si coincide con
   *  CUALQUIERA de ellos (no hace falta que los cumpla todos). */
  terminos: string[];
  /**
   * Cuando se da, se prefieren los productos cuyo `skinType` la mencione —
   * pero SOLO si eso deja al menos uno: los dos filtros solares comparten
   * casi todo el catálogo de protección solar, y no todos los productos
   * traen `skinType` cargado. Preferir sin vaciar es mejor que exigir un
   * dato que la mitad del catálogo no tiene.
   */
  pielClave?: "seca" | "grasa";
}

export const CONDICIONES_POS: CondicionPOS[] = [
  { key: "manchas", label: "Manchas", terminos: ["manchas"] },
  { key: "acne", label: "Acné", terminos: ["acne"] },
  { key: "caspa", label: "Caspa", terminos: ["caspa"] },
  { key: "caida-cabello", label: "Caída de cabello", terminos: ["caida", "cabello"] },
  // "bloqueador" (no "filtro"): su sinónimo trae las marcas reales del
  // catálogo — Anthelios, Photoderm, Capital Soleil — no solo "solar"/"spf".
  { key: "filtro-seca", label: "Filtro solar piel seca", terminos: ["bloqueador"], pielClave: "seca" },
  { key: "filtro-grasa", label: "Filtro solar piel grasa", terminos: ["bloqueador"], pielClave: "grasa" },
];

/** Todo el texto donde puede aparecer una pista del problema que resuelve. */
function haystackProducto(p: Product): string {
  return normalizeForSearch(
    [p.name, p.useType, p.description, p.salesTip, ...(p.keywords ?? []), ...(p.benefits ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

function coincideConTerminos(p: Product, terminos: string[]): boolean {
  const texto = haystackProducto(p);
  return terminos.some((termino) =>
    expandSearchTerm(termino).some((variante) => texto.includes(variante)),
  );
}

/**
 * Productos que resuelven la condición seleccionada. Nunca revienta con una
 * clave desconocida: devuelve la lista vacía, como una búsqueda sin
 * resultados — no es un caso que la UI deba distinguir de "no hay nada".
 */
export function productosPorCondicion(products: Product[], condicionKey: string): Product[] {
  const condicion = CONDICIONES_POS.find((c) => c.key === condicionKey);
  if (!condicion) return [];

  const base = products.filter((p) => coincideConTerminos(p, condicion.terminos));
  if (condicion.pielClave) {
    const clave = condicion.pielClave;
    const acotado = base.filter((p) => normalizeForSearch(p.skinType ?? "").includes(clave));
    if (acotado.length > 0) return acotado;
  }
  return base;
}
