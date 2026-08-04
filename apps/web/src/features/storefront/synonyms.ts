// Lo que el cliente escribe frente a lo que dice la etiqueta del producto.
//
// El fallo que lo motivó: buscar **"bloqueador"** —la palabra que usa todo el
// mundo en República Dominicana— devolvía **cero resultados**, teniendo 83
// protectores solares en catálogo. Ninguna caja dice "bloqueador"; dicen
// "SPF 50", "Fluido Solar", "Photoderm".
//
// El catálogo está lleno de nombres comerciales franceses: quien busca "acné"
// no encuentra "Cleanance", ni "Effaclar", ni "Sebium", aunque sean exactamente
// eso. El puente entre el problema del cliente y la marca del producto lo pone
// esta tabla.
//
// **Ampliar no es sustituir**: lo que tecleó el cliente va siempre incluido. Si
// existiera un producto llamado literalmente "Bloqueador", tiene que salir el
// primero.

import { normalizeForSearch } from "./catalog-query";

/**
 * Sinónimos por término. La clave va normalizada —sin tildes y en minúsculas—
 * porque así es como llega desde `queryCatalog`.
 */
const SINONIMOS: Record<string, string[]> = {
  // Protección solar: "bloqueador" es LA palabra en RD.
  bloqueador: ["solar", "spf", "sunscreen", "photoderm", "anthelios", "capital soleil"],
  bloqueadores: ["solar", "spf", "sunscreen"],
  protector: ["solar", "spf", "sunscreen"],
  protectores: ["solar", "spf", "sunscreen"],
  sunblock: ["solar", "spf", "sunscreen"],
  filtro: ["solar", "spf"],
  pantalla: ["solar", "spf"],

  // Acné: el cliente dice el problema, la caja dice la marca.
  acne: [
    "cleanance",
    "effaclar",
    "sebium",
    "keracnyl",
    "normaderm",
    "comedomed",
    "acniover",
    "benzac",
    "biretix",
    "hyseac",
    "grasa",
  ],
  espinillas: ["acne", "cleanance", "effaclar", "comedomed"],
  granos: ["acne", "cleanance", "effaclar"],
  barros: ["acne", "cleanance", "effaclar"],
  puntos: ["comedomed", "negros"],

  // Otros motivos frecuentes de consulta.
  caspa: ["kelual", "anticaspa", "squanorm", "capilar"],
  manchas: ["despigmentante", "pigmentclar", "melascreen", "pigmenbio"],
  arrugas: ["antiedad", "redermic", "liftactiv", "retinol"],
  resequedad: ["hidratante", "xeramance", "atoderm", "lipikar"],
  reseca: ["hidratante", "atoderm", "lipikar"],
  caida: ["capilar", "anticaida", "neoptide", "creastim"],
  cabello: ["capilar", "shampoo", "champu"],
  rosacea: ["rosaliac", "sensibio", "antirojeces"],
  ojeras: ["contorno", "ojos"],
  celulitis: ["reafirmante", "corporal"],
  estrias: ["corporal", "reafirmante"],
  bebe: ["pediatrico", "infantil", "atoderm"],
  cicatriz: ["cicalfate", "cicaplast", "reparador"],
  quemadura: ["cicalfate", "cicaplast", "reparador"],
};

/**
 * El término tecleado más sus sinónimos, todos normalizados y sin repetir.
 *
 * `queryCatalog` exige que TODOS los tokens de la búsqueda coincidan; con la
 * ampliación, cada token se cumple si coincide con **cualquiera** de sus
 * sinónimos. Así "bloqueador facial" sigue exigiendo las dos cosas.
 */
export function expandSearchTerm(termino: string): string[] {
  const base = normalizeForSearch(termino ?? "");
  if (!base) return [];

  const sinonimos = SINONIMOS[base] ?? [];
  return [...new Set([base, ...sinonimos.map((s) => normalizeForSearch(s))])];
}
