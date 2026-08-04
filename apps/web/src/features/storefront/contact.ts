// Enlaces de contacto de la tienda.
//
// La tienda de estas fases NO cobra: el cierre de la venta ocurre por WhatsApp o
// en la sucursal. El enlace de WhatsApp es, por tanto, el botón más importante
// de la página, y armarlo mal —número sin código de país, teléfono vacío
// convertido en `https://wa.me/`— no da error: abre WhatsApp con una conversación
// en blanco y la venta se pierde en silencio. Por eso esto es una función pura,
// probada, y devuelve `null` cuando el número no sirve, para que la interfaz
// pueda no pintar el botón en vez de pintar uno roto.

/** Prefijo de República Dominicana. */
const CODIGO_PAIS = "1";

/** Longitud de un teléfono dominicano sin código de país. */
const LARGO_LOCAL = 10;

/**
 * Teléfono en el formato que espera `wa.me`: solo dígitos y con código de país.
 * Devuelve `null` si no queda un número marcable.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digitos = (phone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // 809 / 829 / 849 son dominicanos; el 8 y el 9 iniciales los cubren.
  if (digitos.length === LARGO_LOCAL) return `${CODIGO_PAIS}${digitos}`;
  // Un número más corto que 10 dígitos no es marcable: mejor no ofrecer el botón.
  if (digitos.length < LARGO_LOCAL) return null;
  return digitos;
}

/**
 * URL de WhatsApp lista para un `href`, o `null` si no hay número utilizable.
 * El mensaje se codifica siempre: los nombres de producto llevan tildes, comas
 * y símbolos como "+" que sin codificar romperían el texto prellenado.
 */
export function whatsappLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const numero = whatsappNumber(phone);
  if (!numero) return null;
  const base = `https://wa.me/${numero}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Mensaje con el que un cliente pregunta por un producto concreto. */
export function productInquiryMessage(title: string, url: string): string {
  return `Hola, me interesa este producto: ${title} — ${url}`;
}
