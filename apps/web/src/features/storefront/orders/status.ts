// Por dónde puede pasar un pedido y por dónde no.
//
// Función pura y en un solo sitio: el estado lo cambian la pantalla del ERP y
// una ruta de servidor, y si cada una llevara su propia idea de qué es válido,
// acabarían discrepando —y el servidor tiene que poder rechazar una transición
// aunque el botón que la pidió existiera—.
//
// No hay marcha atrás a propósito: deshacer se hace CANCELANDO, que deja rastro
// en la auditoría, no retrocediendo, que lo borra.
//
// Las claves están en español porque son también los valores del CHECK de
// `web_orders.status`: un `status` en inglés en la base y en español en la
// pantalla obligaría a un mapa más que sólo sirve para equivocarse.

export const WEB_ORDER_STATUSES = [
  "recibido",
  "confirmado",
  "preparando",
  "listo",
  "entregado",
  "cancelado",
] as const;

export type WebOrderStatus = (typeof WEB_ORDER_STATUSES)[number];

const ETIQUETAS: Record<WebOrderStatus, string> = {
  recibido: "Recibido",
  confirmado: "Confirmado",
  preparando: "Preparando",
  listo: "Listo para retirar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** A dónde puede ir cada estado. Lo final no lleva a ninguna parte. */
const TRANSICIONES: Record<WebOrderStatus, WebOrderStatus[]> = {
  recibido: ["confirmado", "cancelado"],
  confirmado: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export function webOrderStatusLabel(status: WebOrderStatus): string {
  return ETIQUETAS[status];
}

/**
 * Igual, pero sabiendo si el pedido se retira o se lleva.
 *
 * "Listo para retirar" sobre un pedido a domicilio es la clase de frase que
 * hace llamar al cliente preguntando si tiene que ir a buscarlo. Los estados
 * son los mismos —son los valores del CHECK— y lo único que cambia es cómo se
 * cuentan.
 */
const ETIQUETAS_ENVIO: Partial<Record<WebOrderStatus, string>> = {
  listo: "En camino",
  entregado: "Entregado",
};

export function webOrderStatusLabelFor(
  status: WebOrderStatus,
  fulfillment: "pickup" | "delivery",
): string {
  if (fulfillment === "delivery") return ETIQUETAS_ENVIO[status] ?? ETIQUETAS[status];
  return ETIQUETAS[status];
}

export function nextStatuses(from: WebOrderStatus): WebOrderStatus[] {
  return TRANSICIONES[from];
}

export function canTransition(
  from: WebOrderStatus,
  to: WebOrderStatus,
): boolean {
  return TRANSICIONES[from].includes(to);
}

export function isFinalStatus(status: WebOrderStatus): boolean {
  return TRANSICIONES[status].length === 0;
}
