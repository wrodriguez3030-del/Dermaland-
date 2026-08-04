// ¿Este producto puede salir a internet?
//
// La regla vivía escrita TRES veces: en el script de sembrado, en los filtros
// SQL de la lectura pública y en la cabeza de quien mirara la lista. Tres copias
// de una regla que cambia —mañana entran los productos con receta, o se decide
// publicar sin foto— es la forma segura de que un día el catálogo enseñe algo
// que no debía.
//
// Aquí está una sola vez, en una función pura y probada, y devuelve los MOTIVOS
// en lenguaje llano: el administrador tiene que poder leer "no tiene foto" en
// vez de deducirlo de un interruptor que no se deja encender.

export interface PublishCandidate {
  active: boolean;
  sellable: boolean;
  deletedAt: string | null;
  price: number | null;
  requiresPrescription: boolean;
  controlled: boolean;
  /** Ya comprobada contra el bucket propio por `publicImageUrl`. */
  hasValidImage: boolean;
}

/**
 * Motivos por los que NO se puede publicar. Lista vacía = se puede.
 *
 * Se devuelven TODOS y no solo el primero: si a un producto le falta la foto y
 * el precio, decirlo de uno en uno obliga al administrador a dar dos vueltas.
 */
export function publishBlockers(candidato: PublishCandidate): string[] {
  const motivos: string[] = [];
  if (candidato.deletedAt) motivos.push("Está eliminado del catálogo");
  if (!candidato.active) motivos.push("Está inactivo");
  if (!candidato.sellable) motivos.push("No está marcado como vendible");
  if (!candidato.price || candidato.price <= 0) motivos.push("No tiene precio");
  // Receta y controlados: vender esto por internet sin receptor identificado no
  // es una decisión de diseño, es una obligación sanitaria.
  if (candidato.requiresPrescription) motivos.push("Requiere receta médica");
  if (candidato.controlled) motivos.push("Es un producto controlado");
  if (!candidato.hasValidImage) motivos.push("No tiene foto propia");
  return motivos;
}

/** Atajo para la lectura pública, que no necesita los motivos. */
export function isPublishable(candidato: PublishCandidate): boolean {
  return publishBlockers(candidato).length === 0;
}
