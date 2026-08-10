/**
 * La marca DermaLand como un único trazo vectorial.
 *
 * Este path estaba copiado a mano en seis sitios —el SVG público, la ruta
 * `/api/brand/logo`, las dos tarjetas Open Graph y los dos generadores de PDF—
 * y cada copia decidía su propio color. Ya habían divergido: la tarjeta de la
 * tienda pintaba el logo en el teal de la interfaz (`--brand-primary`) mientras
 * el logo de verdad es verde salvia, así que quien compartía el enlace de la
 * tienda anunciaba un logo que no es el suyo.
 *
 * El color vive aquí y NO es `--brand-primary`. Son dos cosas distintas que
 * conviene no confundir: el teal es el color de la interfaz (botones, navegación
 * activa) y el salvia es el de la marca. Que el botón y el logo no compartan
 * color es una decisión de diseño, no un descuido.
 */

/** Verde salvia del avatar institucional (Instagram @dermalandrd). */
export const DERMALAND_LOGO_COLOR = "#7E8A6E";

/**
 * Hoja/gota con una «D» calada. `fill-rule: evenodd` es lo que recorta la
 * letra: sin él la «D» se rellena y queda una mancha.
 */
export const DERMALAND_LOGO_PATH =
  "M256 60 C256 60 120 220 120 330 A136 136 0 1 0 392 330 C392 220 256 60 256 60 Z " +
  "M190 210 H270 C330 210 360 255 360 305 C360 355 330 400 270 400 H190 Z " +
  "M218 240 H268 C305 240 325 270 325 305 C325 340 305 370 268 370 H218 Z";

/** El logo como SVG suelto. El color se puede forzar (fondos oscuros). */
export function dermalandLogoSvg(color: string = DERMALAND_LOGO_COLOR): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${color}" fill-rule="evenodd" d="${DERMALAND_LOGO_PATH}"/></svg>`;
}

/**
 * El logo como `data:` URI, que es como lo necesitan las tarjetas Open Graph:
 * el rasterizador no puede ir a buscar un archivo por la red.
 */
export function dermalandLogoDataUri(
  color: string = DERMALAND_LOGO_COLOR,
): string {
  return `data:image/svg+xml;base64,${Buffer.from(dermalandLogoSvg(color)).toString("base64")}`;
}
