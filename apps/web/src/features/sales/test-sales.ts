/**
 * Reconoce las ventas DE PRUEBA por el nombre del cliente. PURO.
 *
 * El dueño y su equipo prueban el POS y la tienda con sus propios nombres. El
 * 2026-09-05 las 52 ventas que había en producción eran todas suyas — mismo
 * teléfono, direcciones de relleno — y se borraron. Para que las pruebas nuevas
 * no se acumulen, esta regla la usan el script de limpieza y el trabajo diario.
 *
 * La comparación es por PALABRA COMPLETA sobre el nombre sin acentos ni
 * mayúsculas, e incluye las erratas que ya aparecieron («wilian» con una sola
 * L). Un apellido no basta: «Rodríguez» solo nunca marca una venta como prueba,
 * porque es de los apellidos más comunes del país.
 */

/** Nombres que marcan una venta como de prueba. Sin acentos, en minúsculas. */
export const NOMBRES_DE_PRUEBA: ReadonlyArray<string> = [
  "willian",
  "wilian",
  "william",
  "alan",
  "dario",
];

function normalizar(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** `true` si ese nombre de cliente corresponde a una venta de prueba. */
export function esVentaDePrueba(nombreCliente: string | null | undefined): boolean {
  const nombre = normalizar(nombreCliente);
  if (!nombre) return false;
  const palabras = new Set(nombre.split(/[^a-z0-9]+/).filter(Boolean));
  return NOMBRES_DE_PRUEBA.some((n) => palabras.has(n));
}
