// El nombre del producto, limpio de marcadores internos.
//
// El catálogo del ERP lleva anotaciones que el personal usa a diario y que el
// cliente no debería ver nunca: `** Detalle **` distingue la unidad suelta de la
// caja, y hay corchetes con notas de almacén.
//
// Cuatro productos salieron así a la tienda en vivo. El cliente lo veía en la
// ficha **y** en el mensaje de WhatsApp que enviaba, porque el título viaja
// dentro. Se arregla aquí y no cambiando las cuatro filas: el ERP seguirá
// usando esos marcadores —los necesita— y el siguiente producto que alguien
// anote así volvería a salir mal.
//
// Regla: se limpia el nombre del catálogo. Si el negocio escribe un `web_title`
// en el admin, ese manda y no se toca — es un texto pensado para el público.

/** Marcadores que el ERP usa entre `**` o entre `[]`. */
const MARCADORES = /\*\*[^*]*\*\*|\[[^\]]*\]/g;

export function cleanPublicTitle(nombre: string | null | undefined): string {
  const original = (nombre ?? "").trim();
  if (!original) return "";

  const limpio = original.replace(MARCADORES, " ").replace(/\s+/g, " ").trim();

  // Si quitar los marcadores deja el nombre vacío, es que el nombre ERA el
  // marcador. Una ficha sin título es peor que una con un marcador raro.
  return limpio || original;
}
