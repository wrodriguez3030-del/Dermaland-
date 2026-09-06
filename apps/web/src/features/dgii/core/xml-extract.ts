/**
 * v339 — Módulo HOJA puro para la extracción estructural de tags XML.
 * La función es la MISMA de b2b-reception (v325) movida sin cambios a un módulo
 * sin dependencias, para que consumidores PUROS (postulacion-content,
 * certification-portal) no arrastren prisma/storage. b2b-reception la
 * RE-EXPORTA, así su API pública no cambia (acecf-reception y tests intactos).
 */

/** Extracción ESTRUCTURAL segura (sin parser DOM, sin resolución de entidades). */
export function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]{1,200})</${tag}>`));
  return m ? m[1]!.trim() : null;
}
