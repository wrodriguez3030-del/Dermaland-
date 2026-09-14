/**
 * Lógica pura de la selección múltiple de sucursales. `[]` significa
 * SIEMPRE "todas" — nunca "ninguna" — porque un filtro que se puede vaciar
 * por accidente y dejar de traer nada es peor que uno que no se puede
 * vaciar. Semántica portada de `BranchMultiSelect` de agendapp
 * (`~/Projects/agendapp/src/components/facturar/BranchMultiSelect.tsx`).
 */

export interface OpcionSucursal {
  id: string;
  name: string;
}

/**
 * Alterna una sucursal dentro de la selección. Si se parte de `[]` (todas),
 * la primera marca/desmarca actúa sobre el conjunto COMPLETO — desmarcar una
 * desde "todas" deja todas MENOS esa, no solo esa. Si el resultado termina
 * siendo el conjunto completo otra vez, se normaliza a `[]`.
 */
export function alternarSucursal(
  seleccionadas: string[],
  id: string,
  opciones: readonly OpcionSucursal[],
): string[] {
  const todas = opciones.map((o) => o.id);
  const base = seleccionadas.length === 0 ? todas : seleccionadas;
  const siguiente = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  return normalizarSeleccion(siguiente, opciones);
}

/**
 * Limpia una selección guardada (p. ej. venida de la URL): quita ids que ya
 * no existen o están inactivas, y si el resultado es el conjunto completo de
 * opciones lo reduce a `[]` (su forma canónica).
 */
export function normalizarSeleccion(
  seleccionadas: string[],
  opciones: readonly OpcionSucursal[],
): string[] {
  const validos = new Set(opciones.map((o) => o.id));
  const filtrada = [...new Set(seleccionadas)].filter((id) => validos.has(id));
  return filtrada.length === opciones.length ? [] : filtrada;
}

/** Texto del disparador: "Todas las sucursales" / un nombre / "N sucursales". */
export function etiquetaSucursales(
  seleccionadas: string[],
  opciones: readonly OpcionSucursal[],
): string {
  if (seleccionadas.length === 0 || seleccionadas.length === opciones.length) {
    return "Todas las sucursales";
  }
  if (seleccionadas.length === 1) {
    const nombre = opciones.find((o) => o.id === seleccionadas[0])?.name;
    return nombre ?? "1 sucursal";
  }
  return `${seleccionadas.length} sucursales`;
}

/** Nombres separados por coma, para metadatos de exportación (Excel/PDF). */
export function nombresSucursales(
  seleccionadas: string[],
  opciones: readonly OpcionSucursal[],
): string {
  if (seleccionadas.length === 0) return "Todas las sucursales";
  const nombres = seleccionadas
    .map((id) => opciones.find((o) => o.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return nombres.length > 0 ? nombres.join(", ") : "Todas las sucursales";
}
