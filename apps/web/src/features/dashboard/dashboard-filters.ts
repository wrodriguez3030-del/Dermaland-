/**
 * Filtros del dashboard: sucursal / mes / año. Lógica pura y testeable.
 * `"all"` = Todos. El mes es 1–12 (como string); el año, "2026".
 */
export type MonthFilter = "all" | string;
export type YearFilter = "all" | string;

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

/** ¿La fecha cae dentro del mes/año elegidos? `"all"` no restringe. */
export function matchesPeriod(
  dateIso: string,
  month: MonthFilter,
  year: YearFilter,
): boolean {
  if (month === "all" && year === "all") return true;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  // UTC para que el filtro sea determinista (coincide con los timestamps
  // almacenados) e independiente de la zona horaria del entorno.
  if (year !== "all" && d.getUTCFullYear() !== Number(year)) return false;
  if (month !== "all" && d.getUTCMonth() + 1 !== Number(month)) return false;
  return true;
}

/** Años presentes en un conjunto de fechas, descendente (para el selector). */
export function availableYears(dates: string[]): number[] {
  const years = new Set<number>();
  for (const iso of dates) {
    const y = new Date(iso).getUTCFullYear();
    if (!Number.isNaN(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
