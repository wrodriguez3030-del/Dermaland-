import type { Customer } from "@/types";

/**
 * Etiquetas derivadas del cliente (no persistidas): se calculan en cada render
 * a partir de sus datos, así expiran solas sin necesidad de un job/limpieza.
 */

/** Días durante los cuales un cliente recién creado se marca como "Nuevo". */
export const NEW_CUSTOMER_WINDOW_DAYS = 7;

/**
 * `true` si el cliente se creó dentro de la ventana "Nuevo" (por defecto 7 días).
 *
 * Se compara contra `now` en cada render, por lo que la etiqueta desaparece
 * automáticamente una semana después del alta. Fechas inválidas o futuras no
 * marcan (evita falsos "Nuevo" por relojes desfasados).
 */
export function isNewCustomer(
  c: Pick<Customer, "createdAt">,
  now: Date = new Date(),
  windowDays: number = NEW_CUSTOMER_WINDOW_DAYS,
): boolean {
  if (!c.createdAt) return false;
  const created = new Date(c.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const ageMs = now.getTime() - created;
  if (ageMs < 0) return false;
  return ageMs < windowDays * 24 * 60 * 60 * 1000;
}
