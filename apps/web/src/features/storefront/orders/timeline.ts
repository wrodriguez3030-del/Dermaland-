// Por dónde va el pedido, contado al cliente.
//
// Dos cosas distintas y las dos puras:
//   · `buildOrderTimeline` — la línea de progreso que se ve en la página.
//   · `customerStatusMessage` — el aviso que le llega por correo o WhatsApp.
//
// Están juntas a propósito: si la página dice "en camino" y el correo dice
// "listo para retirar", el cliente llama para preguntar cuál de las dos es
// verdad. Un solo sitio decide cómo se cuenta cada estado.
//
// Los textos cambian según sea retiro o envío. "Listo para retirar" a alguien
// que pidió a domicilio no significa nada.

import type { WebOrderStatus } from "./status";

export type Fulfillment = "pickup" | "delivery";

export interface TimelineStep {
  key: WebOrderStatus;
  label: string;
  done: boolean;
  current: boolean;
}

/** El camino normal. `cancelado` no está: no es un paso, es una salida. */
const CAMINO = [
  "recibido",
  "confirmado",
  "preparando",
  "listo",
  "entregado",
] as const satisfies readonly WebOrderStatus[];

type PasoDelCamino = (typeof CAMINO)[number];

const ETIQUETAS: Record<PasoDelCamino, Record<Fulfillment, string>> = {
  recibido: {
    pickup: "Recibimos tu pedido",
    delivery: "Recibimos tu pedido",
  },
  confirmado: {
    pickup: "Confirmamos disponibilidad",
    delivery: "Confirmamos disponibilidad",
  },
  preparando: {
    pickup: "Preparando tu pedido",
    delivery: "Preparando tu pedido",
  },
  listo: {
    pickup: "Listo para retirar",
    delivery: "En camino / en reparto",
  },
  entregado: {
    pickup: "Retirado",
    delivery: "Entregado",
  },
};

export function buildOrderTimeline(
  status: WebOrderStatus,
  fulfillment: Fulfillment,
): TimelineStep[] {
  // Un pedido cancelado no tiene camino que enseñar; pintar la línea sugeriría
  // que sigue vivo.
  if (status === "cancelado") return [];

  const actual = (CAMINO as readonly WebOrderStatus[]).indexOf(status);
  return CAMINO.map((key, i) => ({
    key,
    label: ETIQUETAS[key][fulfillment],
    done: i <= actual,
    current: i === actual,
  }));
}

export interface CustomerMessage {
  subject: string;
  /** Texto plano: sirve igual para el correo y para WhatsApp. */
  text: string;
}

/**
 * El aviso de cada cambio de estado, o `null` si ese estado no merece aviso.
 *
 * `recibido` no avisa: el cliente acaba de hacer el pedido y ya está viendo la
 * pantalla que se lo confirma. Un correo diciendo lo que acaba de leer es ruido,
 * y el ruido enseña a ignorar los avisos que sí importan.
 */
export function customerStatusMessage(
  status: WebOrderStatus,
  fulfillment: Fulfillment,
  pedido: { number: string; url: string },
): CustomerMessage | null {
  const cuerpos: Partial<Record<WebOrderStatus, string>> = {
    confirmado:
      "Confirmamos que tenemos todo lo que pediste. Ya estamos preparándolo.",
    preparando: "Estamos preparando tu pedido.",
    listo:
      fulfillment === "pickup"
        ? "Tu pedido está listo para retirar en la sucursal."
        : "Tu pedido va en camino. El repartidor te contactará.",
    entregado:
      fulfillment === "pickup"
        ? "Retiraste tu pedido. ¡Gracias por comprar con nosotros!"
        : "Entregamos tu pedido. ¡Gracias por comprar con nosotros!",
    cancelado:
      "Tu pedido fue cancelado. Si crees que es un error, escríbenos y lo revisamos.",
  };

  const cuerpo = cuerpos[status];
  if (!cuerpo) return null;

  return {
    subject: `Pedido ${pedido.number} — ${cuerpo.split(".")[0]}`,
    text: `${cuerpo}\n\nPuedes ver tu pedido ${pedido.number} aquí:\n${pedido.url}`,
  };
}
