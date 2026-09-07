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

/**
 * 🔴 Qué insignia lleva el cliente al lado del nombre: `null` si ninguna.
 *
 * «Nuevo» se calcula por antigüedad, y la migración de Alegra creó los 6 523
 * clientes el mismo día: durante la ventana de novedad, TODO el listado salía
 * marcado «Nuevo» —clientes que llevan comprando desde 2023—. Una insignia que
 * la lleva todo el mundo no informa de nada, y encima miente.
 *
 * Manda el origen: si vino de Alegra, se dice eso. «Nuevo» queda para los que
 * de verdad se dieron de alta aquí hace poco, que es lo que esa palabra
 * significa para quien la lee.
 */
export function insigniaCliente(
  c: Pick<Customer, "createdAt" | "source">,
  now: Date = new Date(),
): { texto: string; tono: "success" | "info" } | null {
  if (c.source === "alegra") return { texto: "Migrado de Alegra", tono: "info" };
  if (isNewCustomer(c, now)) return { texto: "Nuevo", tono: "success" };
  return null;
}
