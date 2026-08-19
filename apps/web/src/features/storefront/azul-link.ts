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
