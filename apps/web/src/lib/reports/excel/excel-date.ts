/**
 * Fechas para Excel con hora LOCAL (RD).
 *
 * ExcelJS serializa `Date` usando sus componentes UTC; si pasáramos el Date
 * del ISO directamente, Excel mostraría la hora UTC (4h adelantada respecto
 * a República Dominicana). Este helper construye un Date cuyos componentes
 * UTC son los componentes LOCALES del original → Excel muestra exactamente
 * la misma hora de pared que la pantalla.
 */
export function toExcelDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
    ),
  );
}
