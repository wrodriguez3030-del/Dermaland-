const dopFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat("es-DO");

const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("es-DO", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrency(value: number): string {
  return dopFormatter.format(value);
}

export function formatNumber(value: number): string {
  return intFormatter.format(value);
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return dateFormatter.format(d);
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return dateTimeFormatter.format(d);
}

export function formatTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return timeFormatter.format(d);
}

export function relativeTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  if (hr < 24) return `hace ${hr} h`;
  if (day < 7) return `hace ${day} d`;
  return formatDate(d);
}

export function daysUntil(value: Date | string): number {
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = d.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * ¿La fecha cae en el día de HOY (hora local)? Fuente única para que el KPI
 * "Ventas hoy" del dashboard y el filtro `?period=today` de /ventas cuenten
 * exactamente lo mismo.
 */
export function isToday(value: Date | string, ref: Date = new Date()): boolean {
  const d = typeof value === "string" ? new Date(value) : value;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

/**
 * ¿La fecha cae en el MISMO mes calendario que `ref` (por defecto, este mes)?
 * Fuente única para "Clientes nuevos" (dashboard) y el filtro
 * `?created=this_month` de /clientes.
 */
export function isSameCalendarMonth(
  value: Date | string,
  ref: Date = new Date(),
): boolean {
  const d = typeof value === "string" ? new Date(value) : value;
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  );
}
