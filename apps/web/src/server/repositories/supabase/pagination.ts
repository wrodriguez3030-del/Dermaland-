/**
 * Trae TODAS las filas de una consulta paginando en el servidor.
 *
 * PostgREST (Supabase) corta cada respuesta en 1000 filas aunque se pida más.
 * Una consulta sin `.range()` sobre una tabla con >1000 filas devuelve solo las
 * primeras 1000 en SILENCIO — el resto desaparece. Este helper pide páginas de
 * `pageSize` con `.range(from, to)` hasta recibir una página incompleta (señal
 * de que ya no hay más).
 *
 * @param fetchPage  Ejecuta la consulta para el rango `[from, to]` inclusive y
 *                   devuelve las filas de esa página.
 * @param pageSize   Tamaño de página. Debe ser ≤ al tope del servidor (1000);
 *                   si fuera mayor, una página "corta" por el tope se
 *                   confundiría con el fin de los datos.
 * @param maxPages   Tope de seguridad anti-loop-infinito (por defecto 50 →
 *                   50 000 filas, muy por encima de cualquier catálogo real).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const batch = await fetchPage(from, from + pageSize - 1);
    all.push(...batch);
    // Página incompleta = ya no hay más filas. También corta cuando `batch`
    // viene vacío (fin exacto en un múltiplo de `pageSize`).
    if (batch.length < pageSize) break;
  }
  return all;
}
