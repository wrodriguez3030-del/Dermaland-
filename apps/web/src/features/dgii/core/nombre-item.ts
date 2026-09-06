/**
 * v572 — El nombre de un ítem del comprobante, y su límite.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * El XSD acota `NombreItem` a 80 caracteres (`AlfNum80Type`) y el builder lo hace cumplir
 * con un `assert`. Hasta ahora eso no lo sabía nadie más:
 *
 *  · Un gasto menor admite `concepto` de 200 y `categoria` de 60, y el nombre del ítem sale
 *    de concatenarlos — hasta 263 caracteres.
 *  · Un pago al exterior admite `concepto` de 200.
 *  · Un producto admite `name` de 160.
 *
 * Los tres se registran sin queja y revientan al pulsar «Emitir comprobante», que es el
 * peor momento: el gasto ya está guardado, la persona cree que terminó, y hasta v571 el
 * mensaje que veía era «Error al preparar el comprobante.» sin decir cuál.
 *
 * Acá vive la regla una sola vez: la usan el schema que valida al registrar, el emisor que
 * arma el comprobante, la pantalla que avisa mientras se escribe y la que imprime el papel.
 * Antes la fórmula del nombre estaba escrita en `petty-expense-emit.ts` y en ningún otro
 * sitio, así que validar el largo desde fuera habría significado copiarla — y dos copias de
 * una fórmula se separan.
 */

/** `AlfNum80Type` del XSD e-CF. Lo hace cumplir `builder.ts` con un assert. */
export const LIMITE_NOMBRE_ITEM = 80;

/**
 * `AlfNum150Type`: la razón social del comprador en el e-CF 41.
 *
 * El builder valida el largo de la razón social del EMISOR pero no la del comprador, así
 * que un proveedor de 151-160 caracteres pasaba el builder y lo rechazaba el XSD — un poco
 * más adelante y con un mensaje de esquema.
 */
export const LIMITE_RAZON_SOCIAL_41 = 150;

/**
 * Cómo se llama el ítem de un gasto menor en su comprobante.
 *
 * La categoría entre paréntesis es informativa y va dentro del mismo campo, así que cuenta
 * para el límite: un concepto de 70 con una categoría de 20 no cabe, aunque cada uno por
 * separado parezca corto.
 */
export function nombreItemGastoMenor(concepto: string, categoria?: string | null): string {
  const c = concepto.trim();
  const cat = categoria?.trim();
  return cat ? `${c} (${cat})` : c;
}

/** ¿Cabe este nombre en el comprobante? */
export const nombreItemCabe = (nombre: string): boolean => nombre.trim().length <= LIMITE_NOMBRE_ITEM;

/**
 * Lo que sobra, para poder decirlo en pantalla.
 *
 * Se devuelve el número, no un mensaje: quien lo muestra sabe si está en un formulario
 * («te sobran 12 caracteres») o en un error de servidor, y cada sitio lo redacta a su modo.
 */
export const caracteresQueSobran = (nombre: string): number =>
  Math.max(0, nombre.trim().length - LIMITE_NOMBRE_ITEM);
