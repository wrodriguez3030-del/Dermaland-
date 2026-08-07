import "server-only";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "@/server/services/sales/share-token";
import { formatDominicanPhone } from "@/lib/utils/formatters";

/**
 * "Ya has comprado aquí": el cliente que vuelve no reescribe sus datos.
 *
 * POR QUÉ NO SE BUSCA POR EL TELÉFONO TECLEADO
 *
 * Lo natural sería: escribes tu número y salen tu nombre y tu dirección. Ese
 * endpoint es también una máquina de cosechar datos: cualquiera puede probar
 * números —en RD son 809/829/849 más siete dígitos— y quedarse con el nombre y
 * el domicilio de cada cliente que acierte. Es una fuga de la base de clientes
 * con forma de comodidad, y no se puede tapar con un límite de peticiones: a
 * diez por minuto son catorce mil números al día.
 *
 * Así que se reconoce el DISPOSITIVO, no el número: al hacer un pedido se deja
 * una galleta firmada que apunta a ese pedido. Quien vuelve desde el mismo
 * teléfono o la misma computadora —que es el caso real casi siempre— encuentra
 * sus datos puestos. Quien teclea el número de otro no obtiene nada.
 *
 * La galleta **no lleva datos personales dentro**: es un puntero firmado con
 * HMAC, exactamente igual que el enlace del pedido. Los datos se leen en el
 * servidor. Si alguien copia la galleta, obtiene lo mismo que si copiara el
 * enlace del pedido, que ya podía compartir por WhatsApp.
 */

/** Nombre de la galleta. Corto y sin decir qué hay dentro. */
export const RETURNING_COOKIE = "dl_c";

/** Seis meses: lo mismo que dura el token que lleva dentro. */
const DURACION_SEGUNDOS = 180 * 24 * 60 * 60;

export interface RememberedCustomer {
  name: string;
  /** Ya formateado `AAA-BBB-CCCC`, como lo escribe el resto del sistema. */
  phone: string;
  email: string;
  /** Solo si su último pedido fue a domicilio. */
  provinceSlug?: string;
  sector?: string;
  address?: string;
  reference?: string;
}

/**
 * Deja constancia de que este dispositivo hizo un pedido.
 *
 * `httpOnly` porque el JavaScript de la página no tiene nada que hacer con
 * esto, y así un XSS tampoco. `sameSite: lax` para que sobreviva a volver desde
 * el enlace de WhatsApp, que es por donde llega media tienda.
 */
export async function rememberCustomer(
  businessId: string,
  orderId: string,
): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(RETURNING_COOKIE, signDocumentShareToken(businessId, orderId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DURACION_SEGUNDOS,
    });
  } catch {
    // Que no se pueda escribir la galleta NO puede tumbar un pedido ya creado.
  }
}

/** Olvida a este cliente. Lo usa el "No soy yo" del checkout. */
export async function forgetCustomer(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(RETURNING_COOKIE);
  } catch {
    // Nada que hacer: se le sigue enseñando el formulario.
  }
}

/**
 * Los datos del último pedido de este dispositivo, o `null`.
 *
 * Un token de otro negocio, caducado o manipulado devuelve `null` sin más: la
 * verificación es fail-closed por diseño.
 */
/** El último pedido de este dispositivo, para poder volver a él. */
export interface LastOrderLink {
  /** El mismo token firmado de la galleta: sirve tal cual en `/tienda/pedido/[token]`. */
  token: string;
  number: string;
  status: string;
}

/**
 * ¿Este dispositivo tiene un pedido al que volver?
 *
 * El enlace del pedido ya existía y se le enseñaba UNA vez, al confirmarlo.
 * Quien cerraba la pestaña lo perdía: no había forma de volver a encontrarlo
 * desde la tienda, y el pedido quedaba en el limbo desde el punto de vista del
 * cliente aunque el negocio lo estuviera preparando.
 *
 * La galleta que ya se dejaba para no reteclear los datos apunta justo a ese
 * pedido, así que el enlace de vuelta no hace falta inventarlo: estaba ahí sin
 * usar.
 *
 * Devuelve `null` para los pedidos ya cerrados (`entregado`, `cancelado`): un
 * enlace permanente a algo terminado es ruido, y el cliente que vuelve a
 * comprar generará el suyo.
 */
export async function resolveLastOrderLink(
  businessId: string,
): Promise<LastOrderLink | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(RETURNING_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const claims = verifyDocumentShareToken(token);
  if (!claims || claims.businessId !== businessId) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data } = await admin
    .from("web_orders")
    .select("number, status")
    .eq("id", claims.id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "entregado" || data.status === "cancelado") return null;

  return { token, number: data.number, status: data.status };
}

export async function resolveRememberedCustomer(
  businessId: string,
): Promise<RememberedCustomer | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(RETURNING_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const claims = verifyDocumentShareToken(token);
  if (!claims || claims.businessId !== businessId) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data } = await admin
    .from("web_orders")
    .select(
      "contact_name, contact_phone, contact_email, fulfillment, delivery_province, delivery_sector, delivery_address, delivery_reference",
    )
    .eq("id", claims.id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return null;

  const esEnvio = data.fulfillment === "delivery";
  return {
    name: data.contact_name,
    phone: formatDominicanPhone(data.contact_phone),
    email: data.contact_email ?? "",
    // La dirección solo se recuerda si la última vez fue un envío. Rellenar un
    // domicilio en un pedido que fue de retiro sería sacarse un dato de la
    // manga.
    provinceSlug: esEnvio ? (data.delivery_province ?? undefined) : undefined,
    sector: esEnvio ? (data.delivery_sector ?? undefined) : undefined,
    address: esEnvio ? (data.delivery_address ?? undefined) : undefined,
    reference: esEnvio ? (data.delivery_reference ?? undefined) : undefined,
  };
}
