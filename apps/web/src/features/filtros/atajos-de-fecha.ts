import { quickRange, type QuickRangeKey } from "@/features/sales/sales-report";

export type { QuickRangeKey } from "@/features/sales/sales-report";
export { quickRange as rangoDeAtajo };

/** Los seis atajos, en el orden en que se muestran. */
export const ATAJOS: readonly { clave: QuickRangeKey; etiqueta: string }[] = [
  { clave: "today", etiqueta: "Hoy" },
  { clave: "yesterday", etiqueta: "Ayer" },
  { clave: "last7", etiqueta: "Últimos 7 días" },
  { clave: "thisMonth", etiqueta: "Este mes" },
  { clave: "lastMonth", etiqueta: "Mes anterior" },
  { clave: "all", etiqueta: "Todo" },
] as const;

export const ETIQUETA_PERSONALIZADO = "Personalizado";

/**
 * Qué atajo corresponde a un rango {desde,hasta}. El chip activo se DERIVA
 * de las fechas — nunca se guarda por separado — para que escribir una fecha
 * a mano y luego volver a pegarla en el rango de "Hoy" vuelva a resaltar
 * "Hoy" sin código adicional.
 *
 * `{from:"",to:""}` es "Todo" incluso sin `hoy` (no depende de la fecha de
 * hoy, así que es seguro decidirlo en el servidor). Con cualquier otra
 * combinación, sin `hoy` (antes de montar en el cliente) no hay chip
 * decidible: se devuelve `null` para no arriesgar una pastilla equivocada
 * por la diferencia de huso horaria entre servidor y navegador.
 */
export function detectarAtajo(
  desde: string,
  hasta: string,
  hoy: Date | null,
): QuickRangeKey | null {
  if (!desde && !hasta) return "all";
  if (!hoy) return null;
  for (const { clave } of ATAJOS) {
    if (clave === "all") continue;
    const r = quickRange(clave, hoy);
    if (r.from === desde && r.to === hasta) return clave;
  }
  return null;
}
