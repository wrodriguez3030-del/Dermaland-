/**
 * Rango por defecto de Reportes → Alegra: el mes en curso, no "últimos 30
 * días" (que no tenía chip que lo resaltara y se veía como si no hubiera
 * filtro aplicado). Trabaja sobre CADENAS `YYYY-MM-DD` — nunca `new Date()`
 * del lado del servidor — porque `hoy` ya viene calculado en huso horario
 * dominicano (`hoyRD()` en la página) y construir una segunda fecha aquí
 * podría desalinearse con esa.
 */
export function rangoPorDefecto(hoy: string): { desde: string; hasta: string } {
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}
