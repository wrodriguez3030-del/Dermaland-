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

/**
 * Mes y año EN CURSO, en hora local del navegador — la misma convención que
 * `mesesDeLaTendencia`, `quickRange` y `saleDateKey`. Es la ÚNICA definición de
 * "este mes" para el Dashboard y el índice de Reportes. Quien lo use en un
 * componente debe llamarlo DESPUÉS de montar (patrón `mounted`): el servidor
 * corre en UTC y de noche puede estar ya en otro mes.
 *
 * 🔴 LOCAL a propósito, no UTC. En RD (AST, UTC-4) el 30 a las 9 p. m. ya es
 * día 1 en UTC: con UTC el panel abriría diciendo "Octubre" mientras el
 * calendario del dueño marca 30 de septiembre — la etiqueta equivocada cuatro
 * horas cada noche, justo en el cierre de mes.
 *
 * Queda en pie una diferencia ANTERIOR a esto y ajena a esta función: para
 * clasificar cada venta, `matchesPeriod` (panel) usa UTC mientras `saleDateKey`
 * (Reportes) usa local, así que una venta de esa franja nocturna cae en meses
 * distintos según la pantalla. Pasa igual eligiendo el mes a mano; unificarlo
 * cambia lo que cuentan TODOS los filtros de mes y además `/api/customers/
 * nuevos` compara en UTC del lado del servidor, así que es decisión aparte.
 */
export function periodoActual(ref: Date = new Date()): { month: MonthFilter; year: YearFilter } {
  return { month: String(ref.getMonth() + 1), year: String(ref.getFullYear()) };
}

/** Texto legible del período elegido, para decir en pantalla qué se está mirando. */
export function etiquetaDelPeriodo(month: MonthFilter, year: YearFilter): string {
  if (year === "all") return "Todo el histórico";
  if (month === "all") return `Todos los meses de ${year}`;
  const nombre = MONTH_NAMES[Number(month) - 1] ?? month;
  return `${nombre} ${year}`;
}

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

/**
 * ¿El combo elegido es «un mes concreto, de cualquier año»? Ese caso NO es un
 * rango continuo de fechas, así que no se le puede pedir a la base (ver
 * `rangoDelPeriodo`). Se detecta aparte para avisar en pantalla en vez de
 * pedir sin querer todo el histórico.
 */
export function mesSinAnio(month: MonthFilter, year: YearFilter): boolean {
  return month !== "all" && year === "all";
}

/**
 * Rango `desde`/`hasta` (YYYY-MM-DD, ambos inclusive) equivalente al filtro de
 * mes/año, para las consultas que solo entienden un rango continuo —como
 * `resumen_ventas_unificadas`, la función que suma las ventas en la base.
 *
 * `null` significa «sin acotar por fecha»: pasa con los dos "Todos" y también
 * con el único combo que un rango no puede expresar (mes fijo + año "Todos"),
 * que quien llame debe detectar antes con `mesSinAnio`.
 */
export function rangoDelPeriodo(
  month: MonthFilter,
  year: YearFilter,
): { desde: string; hasta: string } | null {
  if (year === "all") return null;
  if (month === "all") return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
  const anio = Number(year);
  const mes = Number(month);
  const mm = String(mes).padStart(2, "0");
  // Día 0 del mes siguiente = último día de este mes, en UTC (sin sorpresas de
  // febrero ni de zona horaria).
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
}
