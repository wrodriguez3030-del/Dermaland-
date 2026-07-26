import { z } from "zod";

/**
 * Esquemas de validación de body para route handlers (Regla 2: validar
 * tipo/longitud/formato en el servidor). Son LENIENT a propósito:
 *  - `passthrough()`: dejan pasar campos extra (el repositorio hace whitelisting
 *    de columnas, así que un campo de más no causa mass-assignment). Esto evita
 *    romper entradas válidas del formulario ante campos nuevos.
 *  - Aplican tope de LONGITUD a cualquier string (anti-DoS / datos absurdos).
 *  - `createBody` exige los campos requeridos (POST); `lenientBody` es parcial
 *    (PATCH/edición), donde el cliente envía solo lo que cambió.
 *
 * NO reemplazan el aislamiento por `business_id` (siempre del JWT) ni el
 * whitelisting del repositorio; los complementan.
 */

const MAX_STRING = 5000;

/** Rechaza strings absurdamente largas en cualquier nivel del objeto. */
function capStrings(obj: unknown, ctx: z.RefinementCtx, depth = 0): void {
  if (depth > 6 || obj == null) return;
  if (typeof obj === "string") {
    if (obj.length > MAX_STRING) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un campo de texto es demasiado largo." });
    }
    return;
  }
  if (Array.isArray(obj)) {
    if (obj.length > 2000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Una lista tiene demasiados elementos." });
      return;
    }
    for (const v of obj) capStrings(v, ctx, depth + 1);
    return;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) capStrings(v, ctx, depth + 1);
  }
}

/** Body de EDICIÓN (PATCH): debe ser un objeto; campos parciales; caps de longitud. */
export function lenientBody() {
  return z
    .object({})
    .passthrough()
    .superRefine((obj, ctx) => capStrings(obj, ctx));
}

/** Body de CREACIÓN (POST): igual que lenient + exige los campos `required` (string no vacío). */
export function createBody(required: readonly string[] = []) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const k of required) shape[k] = z.string().trim().min(1, "Falta un campo obligatorio.").max(200);
  return z
    .object(shape)
    .passthrough()
    .superRefine((obj, ctx) => capStrings(obj, ctx));
}

// ─── Esquemas con nombre por entidad (claridad en los handlers) ──────────────
// CREATE exige el/los campo(s) clave; EDIT es parcial.

export const catalogCreate = createBody(["name"]); // productos, categorías, marcas, laboratorios, proveedores
export const catalogEdit = lenientBody();

export const customerCreate = createBody(["firstName", "lastName"]);
export const customerEdit = lenientBody();

export const financeCreate = lenientBody(); // gastos / facturas de proveedor: requeridos variados → lenient
export const financeEdit = lenientBody();

export const genericCreate = createBody([]);
export const genericEdit = lenientBody();
