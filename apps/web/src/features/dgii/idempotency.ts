// La llave que impide emitir dos veces el mismo comprobante.
//
// Un e-NCF es un número que la DGII te dio y que solo puedes gastar una vez.
// Enviarlo dos veces no es un duplicado cualquiera: es un problema fiscal que
// se arregla con papeles, no con un `DELETE`.
//
// Y la lista de cosas que lo provocan es larga y aburrida: el doble clic, el
// refresco de la página, el reintento del trabajo en segundo plano, el cron que
// se solapa consigo mismo, dos funciones sin servidor de Vercel atendiendo a la
// vez, la respuesta que se pierde después de que la DGII ya recibió.
//
// Todas se cierran igual: **la misma operación produce la misma llave**, y la
// llave lleva un índice único detrás. Si llega dos veces, la segunda choca
// contra la base y no contra la DGII.
//
// LA LLAVE ES LO QUE ES POR ESTO
//
//   business_id + ambiente + e-NCF + operación
//
//   · `business_id` — dos negocios pueden tener el mismo e-NCF; son universos
//     separados y la RLS no basta para razonar sobre unicidad.
//   · `ambiente` — el mismo e-NCF existe en pruebas y en producción. **Mezclarlos
//     haría que una prueba bloqueara una emisión real.**
//   · `e-NCF` — es el documento.
//   · `operación` — enviar, consultar y aprobar comercialmente son tres cosas
//     distintas sobre el mismo comprobante. Sin esto, consultar el estado
//     chocaría con el envío que lo creó.

/** Lo que se puede hacer una sola vez sobre un comprobante. */
export const IDEMPOTENT_OPERATIONS = [
  "submit", // entregarlo a la DGII
  "query", // consultar su estado por trackId
  "commercial_approval", // aprobar o rechazar comercialmente
  "cancel", // anularlo
] as const;

export type IdempotentOperation = (typeof IDEMPOTENT_OPERATIONS)[number];

/** Los tres ambientes del CHECK de `electronic_invoices.ambiente`. */
export const DGII_ENVIRONMENTS = ["testecf", "certecf", "ecf"] as const;
export type DgiiEnvironment = (typeof DGII_ENVIRONMENTS)[number];

export interface IdempotencyInput {
  businessId: string;
  environment: DgiiEnvironment;
  /** `E310000000001`. Se normaliza: mayúsculas y sin espacios. */
  encf: string;
  operation: IdempotentOperation;
  /**
   * Distingue un reintento LEGÍTIMO de un duplicado accidental.
   *
   * Un rechazo corregido y vuelto a enviar es otra operación, aunque el e-NCF
   * sea el mismo; sin esto, la llave lo confundiría con el envío original y lo
   * bloquearía para siempre. Se deja fuera cuando no aplica: `undefined` y `0`
   * dan la MISMA llave, para que añadir el campo no invalide lo ya guardado.
   */
  attempt?: number;
}

export class InvalidIdempotencyInput extends Error {}

/**
 * La llave. Determinista, estable y legible.
 *
 * Se devuelve en claro y no como hash a propósito: cuando alguien mire por qué
 * un envío no salió, `d001:ecf:E310000000001:submit` le dice qué pasó, y un
 * hash no le dice nada.
 */
export function buildIdempotencyKey(input: IdempotencyInput): string {
  const businessId = input.businessId?.trim();
  const encf = input.encf?.trim().toUpperCase();

  // Falla en vez de producir una llave a medias: una llave incompleta colisiona
  // con otra distinta y bloquea una emisión que debía salir.
  if (!businessId) throw new InvalidIdempotencyInput("Falta el negocio.");
  if (!encf) throw new InvalidIdempotencyInput("Falta el e-NCF.");
  if (!DGII_ENVIRONMENTS.includes(input.environment)) {
    throw new InvalidIdempotencyInput("Ambiente DGII inválido.");
  }
  if (!IDEMPOTENT_OPERATIONS.includes(input.operation)) {
    throw new InvalidIdempotencyInput("Operación inválida.");
  }

  const partes = [businessId, input.environment, encf, input.operation];
  // `0` y `undefined` producen la misma llave: así, añadir el reintento no
  // cambia las llaves de todo lo ya emitido.
  if (input.attempt !== undefined && input.attempt > 0) {
    partes.push(`r${Math.trunc(input.attempt)}`);
  }
  return partes.join(":");
}

/**
 * ¿Son la misma operación?
 *
 * Existe para decirlo en una línea en el sitio donde importa, en vez de
 * comparar cuatro campos a mano y olvidarse de uno.
 */
export function isSameOperation(
  a: IdempotencyInput,
  b: IdempotencyInput,
): boolean {
  return buildIdempotencyKey(a) === buildIdempotencyKey(b);
}
