const dopFormatter = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat("es-DO");

/**
 * 🔴 `dd/mm/aaaa` en TODO el sistema (pedido del dueño, 08/09/2026).
 *
 * Con `month: "short"` salía «18 jun de 2026» en pantalla mientras el PDF y el
 * Excel ya escribían `18/06/2026`: el mismo dato leído de dos maneras según
 * dónde se mirara. Cambiar aquí lo cambia en los 74 sitios que usan estos
 * helpers; la prueba de al lado impide que vuelva, y el guardián del final de
 * ese archivo impide que alguien lo sortee con un `toLocaleDateString` suelto.
 */
const dateFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "2-digit",
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

/**
 * Lo que se pinta cuando no hay fecha que pintar. Una raya dice "aquí no va
 * nada" sin fingir un dato.
 */
const SIN_FECHA = "—";

/**
 * ¿Es una fecha que `Intl` puede formatear?
 *
 * POR QUÉ ESTA GUARDA EXISTE
 *
 * `Intl.DateTimeFormat.format()` no devuelve "Invalid Date": **lanza**
 * `RangeError: Invalid time value`. Y como estos formateadores se llaman en
 * pleno render, esa excepción no rompe una celda: sube hasta el límite de error
 * de Next y **tumba la página entera** con "Application error: a client-side
 * exception has occurred".
 *
 * Pasó en producción el 2026-08-06: una línea de servicio del POS (el envío de
 * un pedido web) no tiene fecha de vencimiento, llegó como `""`, y el POS
 * completo dejó de cargar. El origen se arregló, pero un formateador capaz de
 * derribar la aplicación por un dato ausente es una trampa esperando al
 * siguiente `""`.
 */
function fechaValida(value: Date | string): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * 🔴 Una fecha SIN hora («2026-09-07») no se corre un día.
 *
 * Lo encontró el dueño el 07/09/2026: «Ventas de hoy» enseñaba «06 sept 2026»
 * en las siete ventas del día. Los importes cuadraban al centavo, así que el
 * filtro estaba bien — lo que mentía era la fecha pintada.
 *
 * La causa: `alegra_invoices.date` es una columna `date` y llega como
 * «2026-09-07». `new Date("2026-09-07")` la lee como MEDIANOCHE UTC, y
 * República Dominicana es UTC-4: en pantalla salen las 8 de la noche del día
 * ANTERIOR. Con el 1 de enero se perdía hasta el año: «2026-01-01» se enseñaba
 * «31/12/2025».
 *
 * Un día sin hora no tiene zona horaria que convertir: el 7 de septiembre es el
 * 7 de septiembre en Santo Domingo, en Madrid y en Tokio. Se pinta tal cual.
 *
 * Una marca de tiempo COMPLETA («2026-09-07T00:00:00Z») sí se convierte, que es
 * lo correcto: ahí sí hay un instante que traducir.
 */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Devuelve `null` si el valor NO tiene forma de día suelto (y entonces lo
 * atiende el camino normal), o la cadena a pintar si la tiene.
 *
 * 🔴 Cuando SÍ tiene esa forma pero el día no existe, devuelve la raya, no
 * `null`: dejándolo caer al camino normal, `new Date("2026-02-31")` no falla —
 * JavaScript lo redondea al 2 de marzo y la pantalla enseñaría una fecha
 * INVENTADA con cara de buena. Lo cazó una prueba de mutación.
 */
function comoDiaSuelto(value: Date | string): string | null {
  if (typeof value !== "string") return null;
  const m = SOLO_FECHA.exec(value.trim());
  if (!m) return null;
  const [, anio, mes, dia] = m as unknown as [string, string, string, string];
  const a = Number(anio);
  const s = Number(mes);
  const d = Number(dia);
  // Se valida de verdad: «2026-02-31» no es un día, y enseñarlo como
  // «31/02/2026» sería inventarse una fecha.
  if (s < 1 || s > 12 || d < 1) return SIN_FECHA;
  const ultimo = new Date(Date.UTC(a, s, 0)).getUTCDate();
  if (d > ultimo) return SIN_FECHA;
  return `${dia}/${mes}/${anio}`;
}

export function formatDate(value: Date | string): string {
  const dia = comoDiaSuelto(value);
  if (dia) return dia;
  const d = fechaValida(value);
  return d ? dateFormatter.format(d) : SIN_FECHA;
}

export function formatDateTime(value: Date | string): string {
  // Sin hora no hay hora que enseñar: se pinta el día a secas, y sin correrlo.
  const dia = comoDiaSuelto(value);
  if (dia) return dia;
  const d = fechaValida(value);
  return d ? dateTimeFormatter.format(d) : SIN_FECHA;
}

export function formatTime(value: Date | string): string {
  const d = fechaValida(value);
  return d ? timeFormatter.format(d) : SIN_FECHA;
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
