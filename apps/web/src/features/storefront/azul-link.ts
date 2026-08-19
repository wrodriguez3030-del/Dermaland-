// El enlace de pago de Azul del comercio (pagos.azul.com.do/...).
//
// Solo se acepta ese dominio exacto por https: el enlace se le enseña a
// clientes para que paguen, así que un tipeo del admin no puede terminar
// mandando a la gente a pagar a otro sitio. `http://` explícito también se
// rechaza —quien lo pegó, pegó un enlace que Azul no sirve—; solo se antepone
// `https://` cuando no se escribió esquema alguno.

const AZUL_HOST = "pagos.azul.com.do";

export type AzulLinkResult =
  | { ok: true; url: string | null }
  | { ok: false; error: string };

const RECHAZO: AzulLinkResult = {
  ok: false,
  error: "Ese enlace no es de pagos.azul.com.do",
};

/** Vacío = sin enlace (borrar es legítimo), nunca un error. */
export function normalizeAzulPaymentLink(input: string): AzulLinkResult {
  const texto = input.trim();
  if (!texto) return { ok: true, url: null };

  const conEsquema = texto.includes("://") ? texto : `https://${texto}`;
  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    return RECHAZO;
  }
  if (url.protocol !== "https:" || url.hostname !== AZUL_HOST) return RECHAZO;
  return { ok: true, url: url.toString() };
}

// El Link de Pagos de Azul se genera POR PEDIDO con el monto fijado al
// crearlo (no hay parámetro de URL para el monto). Esta regla dice qué pedido
// admite que se le ponga —o quite— ese enlace.

export interface AzulLinkOrderState {
  paymentMethod: "efectivo" | "transferencia" | "tarjeta";
  paymentStatus: "pendiente" | "pagado" | "reembolsado";
  status: string;
}

export function canSetAzulLink(
  pedido: AzulLinkOrderState,
): { ok: true } | { ok: false; error: string } {
  if (pedido.paymentMethod !== "tarjeta") {
    return { ok: false, error: "Este pedido no se paga con tarjeta." };
  }
  if (pedido.paymentStatus === "pagado") {
    return { ok: false, error: "Este pedido ya está pagado." };
  }
  if (pedido.paymentStatus === "reembolsado") {
    return { ok: false, error: "Este pedido fue reembolsado." };
  }
  if (pedido.status === "cancelado") {
    return { ok: false, error: "Este pedido está cancelado." };
  }
  return { ok: true };
}
