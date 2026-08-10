/**
 * El texto con el que la tienda se presenta cuando alguien pega su enlace.
 *
 * Hasta ahora salía el lema del negocio —«Dermocosmética y cuidado de la piel
 * en Santiago»—, que dice QUIÉN es el negocio pero no QUÉ se puede hacer aquí.
 * Quien lo recibe por WhatsApp no sabe si le mandaron una tienda donde comprar
 * o la página de presentación de una farmacia, y esa duda es la diferencia
 * entre abrir el enlace y pasar de largo.
 *
 * El lema no se tira: sigue delante, porque es lo que el dueño escribió. Detrás
 * se añade lo que la tienda hace. Si el dueño escribió una descripción propia
 * en Tienda en línea → Configuración, esa manda sola: eligió sus palabras.
 */

/** Tope de la descripción compartida. Más allá, WhatsApp y Google la cortan. */
export const MAX_SHARE_DESCRIPTION = 160;

export interface ShareCopyInput {
  /** Descripción escrita a mano por el dueño. Si está, gana. */
  seoDescription?: string;
  /** Lema del negocio. */
  tagline?: string;
  /** Ciudad de la primera sucursal, para el último recurso. */
  city?: string;
}

/** Lo que la tienda ofrece. Es la parte que faltaba. */
const QUE_SE_PUEDE_HACER =
  "Compra en línea con envío a domicilio o retiro en sucursal.";

export function storefrontShareDescription(input: ShareCopyInput): string {
  const propia = input.seoDescription?.trim();
  if (propia) return recortar(propia);

  const lema = input.tagline?.trim();
  if (lema) {
    // Se une con un punto para que no queden dos frases pegadas cuando el lema
    // no lo trae.
    const separador = /[.!?]$/.test(lema) ? " " : ". ";
    return recortar(`${lema}${separador}${QUE_SE_PUEDE_HACER}`);
  }

  const donde = input.city?.trim();
  return recortar(
    donde
      ? `Dermocosmética y cuidado de la piel en ${donde}. ${QUE_SE_PUEDE_HACER}`
      : `Dermocosmética y cuidado de la piel. ${QUE_SE_PUEDE_HACER}`,
  );
}

/**
 * Corta por la última palabra entera y remata con «…».
 *
 * Cortar a pelo en el carácter 160 parte una palabra por la mitad, y eso en una
 * tarjeta compartida se lee como un error del sitio.
 */
function recortar(texto: string): string {
  if (texto.length <= MAX_SHARE_DESCRIPTION) return texto;
  const cortado = texto.slice(0, MAX_SHARE_DESCRIPTION - 1);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  return `${(ultimoEspacio > 40 ? cortado.slice(0, ultimoEspacio) : cortado).replace(/[.,;:\s]+$/, "")}…`;
}
