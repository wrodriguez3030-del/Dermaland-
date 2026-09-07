/**
 * A quién se le atribuye una factura migrada de Alegra.
 *
 * Vive aparte de `alegra-sync.mts` porque ese guion se conecta a Alegra y a
 * Supabase nada más cargarse: importarlo en una prueba lo haría fallar. Aquí la
 * regla es pura y se puede probar sin red — que es justo lo que hace falta,
 * porque de esta decisión sale la comisión de cada vendedora.
 */

/**
 * Minúsculas, sin tildes y sin espacios de más. `""` si no hay nombre.
 *
 * 🔴 Se normaliza porque Alegra escribe «LAURA MEJIA» y en DermaLand la persona
 * es «Laura Mejía». Comparar el texto tal cual las trataría como dos vendedoras
 * distintas y le partiría las ventas —y la comisión— en dos.
 */
export function normalizarNombre(nombre) {
  if (!nombre) return "";
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve el `seller_id` de una factura:
 *
 * 1. El usuario cuyo nombre coincide con el `seller.name` que mandó Alegra.
 * 2. Si Alegra NO mandó vendedor, la encargada de la sucursal
 *    (`branches.default_seller_id`).
 * 3. Si no hay ninguno, `null` — y la factura se ve suelta en los reportes, que
 *    es mejor que atribuírsela a quien no fue.
 *
 * 🔴 El paso 2 NO se aplica cuando Alegra sí mandó un vendedor que no
 * reconocemos: esa venta es de alguien concreto, y dársela a la encargada de la
 * sucursal sería inventar. Queda suelta hasta que exista su usuario, y la
 * siguiente corrida la ata sola.
 *
 * @param {string|null|undefined} sellerName  `seller.name` tal como vino de Alegra.
 * @param {string|null} branchId              Sucursal ya resuelta de la factura.
 * @param {Map<string,string>} porNombre      nombre normalizado → id de usuario.
 * @param {Map<string,string>} porSucursal    id de sucursal → id de su encargada.
 * @returns {string|null}
 */
export function resolverVendedor(sellerName, branchId, porNombre, porSucursal) {
  const clave = normalizarNombre(sellerName);
  if (clave) return porNombre.get(clave) ?? null;
  return branchId ? (porSucursal.get(branchId) ?? null) : null;
}
