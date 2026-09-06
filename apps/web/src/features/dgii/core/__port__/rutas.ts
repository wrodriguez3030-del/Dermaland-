/**
 * Traductor de rutas para las pruebas portadas de agendapp.
 *
 * Muchas pruebas de agendapp son *guardas de arquitectura*: abren un fichero
 * fuente y comprueban una invariante sobre su texto («dgii-client no llama a
 * fetch», «print-representation es puro»). El valor está en la invariante, no
 * en la ruta; pero la ruta está escrita a mano y es la de agendapp.
 *
 * DermaLand coloca el mismo código en otro sitio:
 *
 *   agendapp                    DermaLand
 *   src/lib/dgii/X.ts       →   src/features/dgii/core/X.ts
 *   docs/dgii/xsd/X.xsd     →   src/features/dgii/core/xsd/X.xsd
 *
 * Este módulo hace esa traducción y NADA más. Lo que no sabe traducir lo deja
 * tal cual, de modo que una prueba que mire un fichero que DermaLand todavía
 * no tiene (servicios, rutas API, pantallas: fases 2-8) siga fallando de forma
 * ruidosa en vez de pasar por accidente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const NUCLEO = path.resolve(__dirname, "..");

export function rutaPortada(...partes: string[]): string {
  // Se admite la forma multi-argumento — `resolve(cwd, "docs", "dgii", "xsd")` —
  // porque así la escriben varias pruebas de agendapp.
  const rel = path.join(...partes);
  if (rel.startsWith("src/lib/dgii/")) {
    return path.join(NUCLEO, rel.slice("src/lib/dgii/".length));
  }
  if (rel === "docs/dgii/xsd") return path.join(NUCLEO, "xsd");
  if (rel.startsWith("docs/dgii/xsd/")) {
    return path.join(NUCLEO, "xsd", rel.slice("docs/dgii/xsd/".length));
  }
  if (rel === "src/lib/dgii") return NUCLEO;
  return path.resolve(process.cwd(), rel);
}

/**
 * Lee un fuente portado, o devuelve "" si DermaLand todavía no tiene ese
 * fichero. Sólo se usa en bloques marcados como PENDIENTE: al estar el
 * `describe` en `.skip`, ese "" nunca llega a una aserción. Existe porque
 * varias guardas de agendapp leen el fichero en el cuerpo del `describe`, y
 * eso revienta en la recolección, antes de que el `.skip` pueda actuar.
 */
export function leerSiExiste(...partes: string[]): string {
  try {
    return readFileSync(rutaPortada(...partes), "utf8");
  } catch {
    return "";
  }
}
