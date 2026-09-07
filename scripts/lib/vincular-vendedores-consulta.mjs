/**
 * Predicado de `vincular-vendedores.mjs`: qué facturas de Alegra le tocan a un
 * vendedor y cuáles cambiarían al atarlas.
 *
 * 🔴 Está aquí fuera, y probado, por lo que pasó con el ensayo. El guion se
 * corre DOS veces: primero sin `--apply` para mirar qué va a hacer, y solo
 * después con `--apply`. Cuando el vendedor todavía no existe como usuario
 * —Desteny, Laura y «Oficina» el día del despliegue— el ensayo no tiene ningún
 * `seller_id` que comparar, y el predicado `seller_id is distinct from $2` con
 * `$2 = NULL` es FALSO para toda fila cuyo `seller_id` sea NULL, o sea para
 * TODAS: el ensayo informaba «0 facturas» justo para los tres vendedores a los
 * que después ataba ~14 743. El único paso manual del despliegue enseñaba lo
 * contrario de lo que iba a hacer.
 *
 * La regla: si el vendedor aún no tiene id, el predicado se CAE. Ninguna fila
 * puede llevar ya un id que todavía no existe, así que «las que cambiarían»
 * son todas las que cumplen el filtro de nombre — que es exactamente lo que el
 * `--apply` escribirá un segundo después, con el id ya creado.
 */

/**
 * @param {{ businessId: string, nombreAlegra: string | null, sellerId: string | null }} opciones
 *   `nombreAlegra` es `null` para el grupo «sin vendedor» de Alegra;
 *   `sellerId` es `null` mientras el usuario no exista (ensayo).
 */
export function consultaVinculacion({ businessId, nombreAlegra, sellerId }) {
  const args = [businessId];
  const condiciones = ["business_id = $1"];

  // Solo hay algo de lo que distinguirse cuando el vendedor ya tiene id.
  let paramSeller = null;
  if (sellerId !== null && sellerId !== undefined) {
    args.push(sellerId);
    paramSeller = `$${args.length}`;
    condiciones.push(`seller_id is distinct from ${paramSeller}`);
  }

  if (nombreAlegra === null) {
    condiciones.push("(seller_name is null or trim(seller_name) = '')");
  } else {
    args.push(nombreAlegra);
    condiciones.push(`upper(trim(seller_name)) = upper($${args.length})`);
  }

  return { where: condiciones.join(" and "), args, paramSeller };
}
