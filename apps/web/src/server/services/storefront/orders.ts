import "server-only";
import { buildCartSummary, parseCartItems } from "@/features/storefront/cart";
import type {
  WebOrder,
  WebOrderItem,
} from "@/features/storefront/orders/types";
import {
  canInvoiceWebOrder,
  canTransition,
  webOrderStatusLabel,
  type WebOrderStatus,
} from "@/features/storefront/orders/status";
import { provinceName } from "@/features/storefront/shipping/provinces";
import { slugify } from "@/features/storefront/slug";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "@/server/services/sales/share-token";
import {
  parseDeliveryAddress,
  quoteShipping,
  type DeliveryAddress,
} from "@/features/storefront/shipping/quote";
import {
  checkOrderStock,
  stockProblemMessage,
} from "@/features/storefront/stock";
import { loadPublishedCatalog } from "./catalog";
import { findOrCreateClient } from "./customer-link";
import { loadShippingRates } from "./shipping";
import { loadWebAvailability } from "./stock";
import { resolveStorefrontTenant } from "./tenant";

/**
 * Alta y consulta de pedidos de la tienda.
 *
 * El TOTAL lo calcula el servidor contra el catálogo publicado, igual que en el
 * carrito: del navegador llegan slugs y cantidades, nunca importes. Y se guarda
 * en INSTANTÁNEA, porque el precio de mañana no es el que se ofreció hoy.
 *
 * El pedido NO mueve inventario. La existencia que vio el visitante es
 * informativa; quien confirma valida la real y puede cancelar líneas.
 */

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export interface CreateWebOrderInput {
  /** Lo que había en el carrito: slugs y cantidades, nada más. */
  items: unknown;
  /** `pickup` por defecto: es lo que funcionaba antes de existir el envío. */
  fulfillment?: "pickup" | "delivery";
  branchSlug?: string;
  /**
   * `efectivo` = paga al recibir o retirar. `transferencia` y `tarjeta` =
   * paga aparte (banco o enlace de Azul) y sube el comprobante.
   */
  paymentMethod?: "efectivo" | "transferencia" | "tarjeta";
  /** Solo cuando es envío. El COSTE lo pone el servidor, nunca el navegador. */
  province?: string;
  sector?: string;
  address?: string;
  reference?: string;
  /**
   * Ubicación que el cliente compartió desde su navegador. Opcional: dar
   * permiso es voluntario y la dirección escrita sigue siendo obligatoria.
   * Las dos van juntas o ninguna.
   */
  deliveryLat?: number;
  deliveryLng?: number;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  /** Un doble clic en "Enviar pedido" no puede crear dos pedidos. */
  idempotencyKey: string;
}

export type CreateWebOrderResult =
  | { ok: true; id: string; token: string; number: string }
  | { ok: false; error: string };

/**
 * Slug público → UUID interno del producto.
 *
 * `PublicProduct` **no expone el UUID** a propósito: es la lista blanca de lo
 * que puede llegar al HTML (R-WEB-01). Así que la traducción se hace aquí, en el
 * servidor, contra `product_web_meta`, que es justo la tabla que empareja los
 * dos. Ampliar `PublicProduct` con el id por comodidad sería deshacer la lista
 * blanca desde dentro.
 */
async function resolverIdsPorSlug(
  admin: Admin,
  businessId: string,
  slugs: string[],
): Promise<Map<string, string>> {
  const { data } = await admin
    .from("product_web_meta")
    .select("slug, product_id")
    .eq("business_id", businessId)
    .in("slug", slugs);
  return new Map((data ?? []).map((r) => [r.slug, r.product_id]));
}

/** `WEB-000123`. Para hablar con el cliente; el acceso lo da el token. */
async function siguienteNumero(admin: Admin): Promise<string | null> {
  const { data, error } = await admin.rpc("nextval_web_order_number");
  if (error || data == null) return null;
  return `WEB-${String(data).padStart(6, "0")}`;
}

/**
 * ¿Son unas coordenadas terrestres de verdad?
 *
 * Llegan del navegador, así que no se dan por buenas: `NaN`, `Infinity`, una
 * sola de las dos, o una latitud de 200 no son "una casa mal ubicada", son un
 * dato corrupto. La base también lo rechaza (CHECK), pero fallar aquí da un
 * pedido correcto sin coordenadas en vez de un pedido perdido por un error de
 * inserción.
 *
 * El (0, 0) se acepta a propósito aunque sea el Golfo de Guinea: filtrarlo
 * sería adivinar, y el repartidor ve enseguida que ese punto no es Santiago.
 */
function coordenadasValidas(
  lat: number | undefined,
  lng: number | undefined,
): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function createWebOrder(
  input: CreateWebOrderInput,
): Promise<CreateWebOrderResult> {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) return { ok: false, error: "La tienda no está disponible." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No se pudo registrar el pedido." };

  // La sucursal se resuelve por su slug PÚBLICO contra las que el servidor ya
  // publica: si el `branch_id` viniera del navegador, un visitante podría
  // mandar el de otro negocio.
  const esEnvio = input.fulfillment === "delivery";

  // La sucursal SIEMPRE existe en el pedido: en un envío es la que lo despacha.
  const sucursal = esEnvio
    ? (tenant.branches.find((b) => b.slug === input.branchSlug) ??
      tenant.branches[0])
    : tenant.branches.find((b) => b.slug === input.branchSlug);
  if (!sucursal) return { ok: false, error: "Elige una sucursal para retirar." };

  const { products } = await loadPublishedCatalog(tenant.businessId);
  const resumen = buildCartSummary(parseCartItems(input.items), products);
  if (resumen.lines.length === 0) {
    return { ok: false, error: "Tu carrito está vacío." };
  }

  const branchId = await resolverSucursal(admin, tenant.businessId, sucursal.slug);
  if (!branchId) return { ok: false, error: "No hay sucursal disponible." };

  // El FLETE lo calcula el servidor contra las tarifas guardadas. Lo que llegue
  // del navegador es la provincia, nunca el precio: si el importe viajara en el
  // cuerpo, cambiarlo con la consola sería elegir cuánto se paga de envío.
  let costoEnvio = 0;
  let direccion: ReturnType<typeof parseDeliveryAddress> | null = null;
  if (esEnvio) {
    direccion = parseDeliveryAddress({
      province: input.province,
      sector: input.sector,
      address: input.address,
      reference: input.reference,
    });
    if (!direccion.ok) return { ok: false, error: direccion.error };

    const tarifas = await loadShippingRates(tenant.businessId);
    const cotizacion = quoteShipping(direccion.value.province, tarifas);
    if (!cotizacion.ok) return { ok: false, error: cotizacion.error };
    costoEnvio = cotizacion.cost;
  }

  const idsPorSlug = await resolverIdsPorSlug(
    admin,
    tenant.businessId,
    resumen.lines.map((l) => l.product.slug),
  );
  // Si algún producto no se puede resolver, se para: un pedido con líneas de
  // menos y el total de todas sería cobrar de más.
  if (idsPorSlug.size !== resumen.lines.length) {
    return { ok: false, error: "Alguno de los productos ya no está disponible." };
  }

  // ¿Hay de verdad lo que está pidiendo?
  //
  // Antes no se miraba en ningún momento: se podían encargar 50 unidades de algo
  // que tenía 1, y el fallo no salía hasta que alguien del negocio abría el
  // pedido y tenía que llamar a deshacerlo. Decirlo AHORA, con el nombre del
  // producto y cuántos quedan, es una molestia; decirlo mañana por teléfono es
  // una venta perdida.
  //
  // Se comprueba contra la existencia menos lo apalabrado en otros pedidos web
  // sin facturar, no contra el almacén a secas: el último frasco no se le puede
  // vender a cinco personas.
  //
  // Queda una carrera abierta —dos pedidos a la vez pueden pasar los dos— y no
  // se cierra con un bloqueo de base porque el pedido no reserva inventario por
  // diseño. Para eso el detalle del ERP enseña la disponibilidad viva antes de
  // confirmar.
  const lineasConId = resumen.lines.map((l) => ({
    productId: idsPorSlug.get(l.product.slug)!,
    productName: l.product.title,
    qty: l.qty,
  }));
  const disponible = await loadWebAvailability(
    tenant.businessId,
    lineasConId.map((l) => l.productId),
  );
  const problemas = checkOrderStock(lineasConId, disponible);
  if (problemas.length > 0) {
    return { ok: false, error: stockProblemMessage(problemas) };
  }

  const numero = await siguienteNumero(admin);
  if (!numero) return { ok: false, error: "No se pudo registrar el pedido." };

  // Todo cliente de la tienda entra en la base de clientes del ERP. Si ya
  // compraba en el mostrador se reutiliza su ficha en vez de duplicarla.
  //
  // Que esto falle NO detiene el pedido: perder una venta porque no se pudo
  // crear una ficha sería absurdo. El pedido guarda el contacto en instantánea
  // igualmente, así que nadie se queda sin saber a quién llamar.
  const clientId = await findOrCreateClient(tenant.businessId, {
    fullName: input.contactName,
    phone: input.contactPhone,
    email: input.contactEmail,
  });

  const { data: pedido, error } = await admin
    .from("web_orders")
    .insert({
      business_id: tenant.businessId,
      branch_id: branchId,
      number: numero,
      client_id: clientId ?? null,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail ?? null,
      fulfillment: esEnvio ? "delivery" : "pickup",
      payment_method:
        input.paymentMethod === "transferencia" ||
        input.paymentMethod === "tarjeta"
          ? input.paymentMethod
          : "efectivo",
      delivery_province: direccion?.ok ? direccion.value.province : null,
      delivery_sector: direccion?.ok ? direccion.value.sector : null,
      delivery_address: direccion?.ok ? direccion.value.address : null,
      delivery_reference: direccion?.ok ? (direccion.value.reference ?? null) : null,
      // Ubicación compartida desde el navegador. Solo en envíos y solo si el
      // cliente dio permiso: en Santiago hay calles sin número y un punto en el
      // mapa evita la llamada del repartidor. Las dos van juntas o ninguna —lo
      // exige el CHECK de la tabla—, así que se validan en pareja.
      delivery_lat:
        esEnvio && coordenadasValidas(input.deliveryLat, input.deliveryLng)
          ? input.deliveryLat
          : null,
      delivery_lng:
        esEnvio && coordenadasValidas(input.deliveryLat, input.deliveryLng)
          ? input.deliveryLng
          : null,
      shipping_cost: costoEnvio,
      subtotal: resumen.total,
      itbis: 0,
      total: resumen.total + costoEnvio,
      notes: input.notes ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (error || !pedido) {
    // 23505 = clave duplicada: es el segundo clic del mismo envío. Se devuelve
    // el pedido que YA se creó en vez de un error, que es lo que el cliente
    // esperaría ver.
    if (error?.code === "23505") {
      const { data: previo } = await admin
        .from("web_orders")
        .select("id, number")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (previo) {
        return {
          ok: true,
          id: previo.id,
          number: previo.number,
          token: signDocumentShareToken(tenant.businessId, previo.id),
        };
      }
    }
    return { ok: false, error: "No se pudo registrar el pedido." };
  }

  const { error: errorLineas } = await admin.from("web_order_items").insert(
    resumen.lines.map((l) => ({
      order_id: pedido.id,
      business_id: tenant.businessId,
      product_id: idsPorSlug.get(l.product.slug)!,
      product_name: l.product.title,
      unit_price: l.product.price,
      qty: l.qty,
      line_total: l.lineTotal,
    })),
  );
  if (errorLineas) {
    // Un pedido sin líneas no le sirve a nadie y ensuciaría la pantalla del
    // negocio: se deshace.
    await admin.from("web_orders").delete().eq("id", pedido.id);
    return { ok: false, error: "No se pudo registrar el pedido." };
  }

  return {
    ok: true,
    id: pedido.id,
    number: numero,
    token: signDocumentShareToken(tenant.businessId, pedido.id),
  };
}

/** Una fila de la lista del ERP. Sin UUID de más de los necesarios. */
export interface WebOrderRow {
  id: string;
  number: string;
  status: WebOrderStatus;
  contactName: string;
  contactPhone: string;
  branchName: string;
  fulfillment: "pickup" | "delivery";
  /** Nombre de la provincia en un envío. Nunca el slug. */
  deliveryProvince?: string;
  total: number;
  createdAt: string;
}

export interface ListWebOrdersResult {
  rows: WebOrderRow[];
  total: number;
}

/** Filas por página. La lista se pagina en el SERVIDOR, siempre. */
export const WEB_ORDERS_PAGE_SIZE = 25;

/**
 * Pedidos del negocio, paginados.
 *
 * `.range()` no es opcional: sin él PostgREST corta en 1000 filas **en
 * silencio**, y la pantalla enseñaría un subconjunto sin decir que lo es.
 */
export async function listWebOrders(
  businessId: string,
  opts: { page?: number; status?: WebOrderStatus } = {},
): Promise<ListWebOrdersResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { rows: [], total: 0 };

  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const desde = (page - 1) * WEB_ORDERS_PAGE_SIZE;

  let q = admin
    .from("web_orders")
    .select(
      "id, number, status, contact_name, contact_phone, total, created_at, branch_id, fulfillment, delivery_province",
      { count: "exact" },
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range(desde, desde + WEB_ORDERS_PAGE_SIZE - 1);

  if (opts.status) q = q.eq("status", opts.status);

  const { data, count, error } = await q;
  if (error || !data) return { rows: [], total: 0 };

  const nombres = await nombresDeSucursal(admin, businessId);

  return {
    total: count ?? 0,
    rows: data.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status as WebOrderStatus,
      contactName: p.contact_name,
      contactPhone: p.contact_phone,
      branchName: nombres.get(p.branch_id) ?? "—",
      fulfillment: p.fulfillment === "delivery" ? "delivery" : "pickup",
      deliveryProvince: provinceName(p.delivery_province) ?? undefined,
      total: Number(p.total),
      createdAt: p.created_at,
    })),
  };
}

/**
 * Cuántos pedidos están sin atender.
 *
 * Solo `recibido`: es el estado que pide una acción humana. Contar también los
 * que ya están en curso convertiría el aviso en un número que nunca baja, y un
 * número que nunca baja deja de mirarse.
 *
 * `head: true` para traer el conteo sin las filas: esto se ejecuta en CADA
 * página del ERP.
 */
export async function countNewWebOrders(businessId: string): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  const { count } = await admin
    .from("web_orders")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "recibido");
  return count ?? 0;
}

/**
 * Una línea vista desde el ERP. Lleva el `productId` que la pública NO lleva:
 * dentro hace falta para mirar el inventario y para pasar el pedido al POS.
 */
export interface WebOrderLineForBusiness extends WebOrderItem {
  productId: string;
}

/** El pedido con lo que solo se enseña puertas adentro. */
export interface WebOrderForBusiness extends Omit<WebOrder, "items"> {
  id: string;
  items: WebOrderLineForBusiness[];
  /** Proforma con la que se facturó, si ya se facturó. */
  proformaId?: string;
  /** Sucursal que retira o despacha. Para el POS y para cambiar la entrega. */
  branchId: string;
  /** Slug de la provincia. `deliveryProvince` es el nombre, que no vale para
   *  preseleccionar un desplegable. */
  deliveryProvinceSlug?: string;
}

/** El pedido completo, para el detalle del ERP. Acotado por `business_id`. */
export async function getWebOrderForBusiness(
  businessId: string,
  id: string,
): Promise<WebOrderForBusiness | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: pedido } = await admin
    .from("web_orders")
    .select(
      "id, number, status, contact_name, contact_phone, contact_email, total, notes, created_at, branch_id, fulfillment, delivery_province, delivery_sector, delivery_address, delivery_reference, delivery_lat, delivery_lng, shipping_cost, payment_method, payment_status, proforma_id",
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!pedido) return null;

  const [{ data: lineas }, nombres] = await Promise.all([
    admin
      .from("web_order_items")
      .select("product_id, product_name, unit_price, qty, line_total")
      .eq("order_id", pedido.id)
      .order("created_at", { ascending: true }),
    nombresDeSucursal(admin, businessId),
  ]);

  return {
    id: pedido.id,
    branchId: pedido.branch_id,
    proformaId: pedido.proforma_id ?? undefined,
    number: pedido.number,
    status: pedido.status as WebOrderStatus,
    branchName: nombres.get(pedido.branch_id) ?? "—",
    fulfillment: pedido.fulfillment === "delivery" ? "delivery" : "pickup",
    deliveryProvince: provinceName(pedido.delivery_province) ?? undefined,
    deliveryProvinceSlug: pedido.delivery_province ?? undefined,
    deliverySector: pedido.delivery_sector ?? undefined,
    deliveryAddress: pedido.delivery_address ?? undefined,
    deliveryLat: pedido.delivery_lat ?? undefined,
    deliveryLng: pedido.delivery_lng ?? undefined,
    deliveryReference: pedido.delivery_reference ?? undefined,
    shippingCost: Number(pedido.shipping_cost ?? 0),
    paymentMethod:
      pedido.payment_method === "transferencia"
        ? "transferencia"
        : pedido.payment_method === "tarjeta"
          ? "tarjeta"
          : "efectivo",
    paymentStatus:
      pedido.payment_status === "pagado"
        ? "pagado"
        : pedido.payment_status === "reembolsado"
          ? "reembolsado"
          : "pendiente",
    contactName: pedido.contact_name,
    contactPhone: pedido.contact_phone,
    contactEmail: pedido.contact_email ?? undefined,
    total: Number(pedido.total),
    items: (lineas ?? []).map((l) => ({
      productId: l.product_id,
      productName: l.product_name,
      unitPrice: Number(l.unit_price),
      qty: l.qty,
      lineTotal: Number(l.line_total),
    })),
    notes: pedido.notes ?? undefined,
    createdAt: pedido.created_at,
  };
}

/**
 * Cambia el estado de un pedido.
 *
 * La transición se valida AQUÍ y no solo en la pantalla: el servidor no puede
 * fiarse de que el botón que llegó fuera uno de los que él pintó.
 */
export async function advanceWebOrder(
  businessId: string,
  id: string,
  to: WebOrderStatus,
  reason?: string,
): Promise<{ ok: boolean; error?: string; from?: WebOrderStatus }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const { data: actual } = await admin
    .from("web_orders")
    .select("status")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!actual) return { ok: false, error: "Pedido no encontrado." };

  const desde = actual.status as WebOrderStatus;

  // Pedir el estado en el que YA está no es un error: lo que el usuario quería
  // conseguir ya es cierto. Pasaba de verdad —facturar adelanta el pedido a
  // «preparando», y quien tuviera la pantalla abierta de antes seguía viendo el
  // botón de «Preparando»— y el aviso «No se puede pasar de "Preparando" a
  // "Preparando"» sonaba a avería sin serlo.
  if (desde === to) return { ok: true, from: desde };

  if (!canTransition(desde, to)) {
    return {
      ok: false,
      error: `No se puede pasar de "${webOrderStatusLabel(desde)}" a "${webOrderStatusLabel(to)}".`,
    };
  }

  const { error } = await admin
    .from("web_orders")
    .update({
      status: to,
      cancel_reason: to === "cancelado" ? (reason ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) return { ok: false, error: "No se pudo cambiar el estado." };
  return { ok: true, from: desde };
}

/**
 * Cambiar cómo se entrega un pedido ya hecho.
 *
 * Hace falta más de lo que parece. El cliente que se equivoca de opción llama
 * al negocio, y hasta ahora la única salida era cancelar y volver a pedir: se
 * perdía el número, el historial y la paciencia del cliente.
 *
 * El FLETE lo vuelve a calcular el servidor con las tarifas de HOY. Es lo
 * correcto: el envío se está decidiendo ahora, no cuando se hizo el pedido. Y
 * jamás llega un importe en la petición — quien cambia la entrega elige el
 * destino, no lo que cuesta.
 *
 * Se bloquea si el pedido ya está facturado: la proforma lleva el flete dentro
 * y cambiarlo aquí dejaría el documento diciendo una cosa y el pedido otra.
 * Para eso está anular la proforma en el POS.
 */
export type ChangeFulfillmentInput =
  | { to: "pickup"; branchId: string }
  | {
      to: "delivery";
      branchId: string;
      province: string;
      sector: string;
      address: string;
      reference?: string;
    };

export async function changeWebOrderFulfillment(
  businessId: string,
  id: string,
  input: ChangeFulfillmentInput,
): Promise<{
  ok: boolean;
  error?: string;
  from?: "pickup" | "delivery";
  shippingCost?: number;
  total?: number;
}> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const { data: actual } = await admin
    .from("web_orders")
    .select("status, fulfillment, subtotal, proforma_id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!actual) return { ok: false, error: "Pedido no encontrado." };

  if (actual.status === "cancelado" || actual.status === "entregado") {
    return {
      ok: false,
      error: "Este pedido ya está cerrado: no se le puede cambiar la entrega.",
    };
  }
  if (actual.proforma_id) {
    return {
      ok: false,
      error:
        "El pedido ya está facturado. Anula la proforma en el POS antes de cambiar la entrega.",
    };
  }

  // La sucursal se comprueba contra las del negocio: un UUID que llegue en la
  // petición no puede ser el de otro negocio ni el de una sucursal cerrada.
  const { data: sucursal } = await admin
    .from("branches")
    .select("id")
    .eq("id", input.branchId)
    .eq("business_id", businessId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (!sucursal) return { ok: false, error: "Elige una sucursal válida." };

  const subtotal = Number(actual.subtotal ?? 0);
  const desde: "pickup" | "delivery" =
    actual.fulfillment === "delivery" ? "delivery" : "pickup";

  let costoEnvio = 0;
  let direccion: DeliveryAddress | null = null;

  if (input.to === "delivery") {
    const parseada = parseDeliveryAddress({
      province: input.province,
      sector: input.sector,
      address: input.address,
      reference: input.reference,
    });
    if (!parseada.ok) return { ok: false, error: parseada.error };

    const tarifas = await loadShippingRates(businessId);
    const cotizacion = quoteShipping(parseada.value.province, tarifas);
    if (!cotizacion.ok) return { ok: false, error: cotizacion.error };

    costoEnvio = cotizacion.cost;
    direccion = parseada.value;
  }

  const total = subtotal + costoEnvio;

  const { error } = await admin
    .from("web_orders")
    .update({
      branch_id: input.branchId,
      fulfillment: input.to,
      // Al pasar a retiro se BORRA la dirección. Dejarla ahí "por si acaso"
      // haría que una pantalla futura pintara un envío que ya no existe.
      delivery_province: direccion?.province ?? null,
      delivery_sector: direccion?.sector ?? null,
      delivery_address: direccion?.address ?? null,
      delivery_reference: direccion?.reference ?? null,
      shipping_cost: costoEnvio,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) return { ok: false, error: "No se pudo cambiar la entrega." };
  return { ok: true, from: desde, shippingCost: costoEnvio, total };
}

/**
 * Lo que el POS necesita para facturar un pedido sin que nadie lo teclee.
 *
 * NO lleva importes. El POS vuelve a poner el precio de cada producto de su
 * propio catálogo, aplica ITBIS y descuentos con sus reglas y escoge lote por
 * FEFO. Copiar aquí los precios del pedido —de hace días— sería emitir una
 * factura con cifras que no salen de ninguna parte.
 */
export interface WebOrderForPos {
  id: string;
  number: string;
  /** La que eligió el cliente para retirar. En un envío no significa nada. */
  branchId: string;
  /**
   * Desde dónde se factura: la sucursal marcada `is_web_fulfillment`.
   *
   * Es una decisión escrita del negocio, no una deducción. Antes se adivinaba
   * por existencia y eso se habría mudado solo el día que otra sucursal
   * recibiera mercancía.
   */
  fulfillmentBranchId: string;
  /** Ficha del ERP, si se pudo enlazar. El POS la preselecciona. */
  clientId?: string;
  contactName: string;
  contactPhone: string;
  fulfillment: "pickup" | "delivery";
  /** El flete se factura como línea de servicio; esto es su importe. */
  shippingCost: number;
  /**
   * Lo que el cliente eligió pagar en la web. El POS lo PRESELECCIONA en el
   * cobro; el cajero puede cambiarlo, porque quien dijo "transferencia" puede
   * llegar con efectivo.
   */
  paymentMethod: "efectivo" | "transferencia";
  /**
   * A dónde va el pedido. Solo en envío. El cajero lo necesita delante para
   * confirmarlo con el cliente y pasárselo al mensajero.
   */
  deliveryProvince?: string;
  deliverySector?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  /** Ubicación compartida desde el navegador, si el cliente dio permiso. */
  deliveryLat?: number;
  deliveryLng?: number;
  lines: { productId: string; qty: number }[];
  /** Ya facturado: el POS no debe volver a cobrarlo. */
  alreadyInvoiced: boolean;
  /**
   * ¿Alguien lo confirmó ya? Hasta entonces no se factura (regla del negocio,
   * 2026-08-07). Se manda al POS para que lo diga con esas palabras en vez de
   * dejar el botón muerto sin motivo.
   */
  canInvoice: boolean;
  status: WebOrderStatus;
}

export async function getWebOrderForPos(
  businessId: string,
  id: string,
): Promise<WebOrderForPos | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: pedido } = await admin
    .from("web_orders")
    .select(
      "id, number, branch_id, client_id, contact_name, contact_phone, fulfillment, shipping_cost, status, proforma_id, payment_method, delivery_province, delivery_sector, delivery_address, delivery_reference, delivery_lat, delivery_lng",
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!pedido) return null;
  // Un pedido cancelado no se factura. Dejar que el POS lo cargara sería
  // ofrecer cobrar algo que el negocio ya dijo que no iba a vender.
  if (pedido.status === "cancelado") return null;

  const [{ data: lineas }, { data: despacho }] = await Promise.all([
    admin
      .from("web_order_items")
      .select("product_id, qty")
      .eq("order_id", pedido.id)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    admin
      .from("branches")
      .select("id")
      .eq("business_id", businessId)
      .eq("is_web_fulfillment", true)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  return {
    id: pedido.id,
    number: pedido.number,
    branchId: pedido.branch_id,
    // Sin sucursal designada se cae a la del pedido: es lo que hacía antes, y
    // un negocio de una sola sucursal no necesita designar nada.
    fulfillmentBranchId: despacho?.id ?? pedido.branch_id,
    clientId: pedido.client_id ?? undefined,
    contactName: pedido.contact_name,
    contactPhone: pedido.contact_phone,
    fulfillment: pedido.fulfillment === "delivery" ? "delivery" : "pickup",
    shippingCost: Number(pedido.shipping_cost ?? 0),
    // El cajero necesita VER a dónde va el pedido y cómo dijo el cliente que
    // iba a pagar. Antes nada de esto llegaba al POS: la dirección había que
    // buscarla en otra pestaña y el método de pago se elegía a mano, pudiendo
    // no coincidir con lo que el cliente eligió en la web.
    paymentMethod:
      pedido.payment_method === "transferencia" ? "transferencia" : "efectivo",
    deliveryProvince: pedido.delivery_province ?? undefined,
    deliverySector: pedido.delivery_sector ?? undefined,
    deliveryAddress: pedido.delivery_address ?? undefined,
    deliveryReference: pedido.delivery_reference ?? undefined,
    deliveryLat: pedido.delivery_lat ?? undefined,
    deliveryLng: pedido.delivery_lng ?? undefined,
    lines: (lineas ?? []).map((l) => ({ productId: l.product_id, qty: l.qty })),
    alreadyInvoiced: Boolean(pedido.proforma_id),
    status: pedido.status as WebOrderStatus,
    canInvoice: canInvoiceWebOrder(pedido.status as WebOrderStatus),
  };
}

/**
 * Deja el documento enlazado al pedido.
 *
 * Se llama DESPUÉS de emitir, no antes: el pedido no puede quedar marcado como
 * facturado por una venta que luego falló. Si esta llamada se pierde, lo que se
 * pierde es el enlace —molesto— y no la factura.
 *
 * Es idempotente con la MISMA proforma: un reintento del navegador no es un
 * error. Con otra distinta sí lo es, y se rechaza: dos documentos por una venta
 * es exactamente lo que este módulo existe para evitar.
 */
export async function linkProformaToWebOrder(
  businessId: string,
  id: string,
  proformaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const { data: pedido } = await admin
    .from("web_orders")
    .select("proforma_id, status")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!pedido) return { ok: false, error: "Pedido no encontrado." };

  if (pedido.proforma_id) {
    return pedido.proforma_id === proformaId
      ? { ok: true }
      : { ok: false, error: "Este pedido ya tiene otra factura enlazada." };
  }

  // La proforma tiene que ser de este negocio. Sin esto, un id de otro tenant
  // enlazaría un documento ajeno al pedido.
  const { data: proforma } = await admin
    .from("proformas")
    .select("id")
    .eq("id", proformaId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!proforma) return { ok: false, error: "Documento no encontrado." };

  // Facturar ADELANTA el pedido a "preparando".
  //
  // Cobrado es, de hecho, confirmado: dejarlo en "recibido" obligaba a moverlo
  // a mano y el aviso del menú seguía contándolo como pendiente aunque ya
  // estuviera pagado. El número del menú cuenta los `recibido`, así que esto es
  // también lo que lo hace bajar.
  //
  // Solo avanza desde los estados PREVIOS: un pedido que ya está `listo` o
  // `entregado` no retrocede porque alguien emita el documento tarde, y uno
  // `cancelado` no revive. `canTransition` es la misma regla que usa el cambio
  // manual, así que no hay dos ideas de qué transición vale.
  const avanzaAPreparando =
    (pedido.status === "recibido" || pedido.status === "confirmado") &&
    canTransition(pedido.status as WebOrderStatus, "preparando");

  const { error } = await admin
    .from("web_orders")
    .update({
      proforma_id: proformaId,
      ...(avanzaAPreparando ? { status: "preparando" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("proforma_id", null);

  if (error) return { ok: false, error: "No se pudo enlazar la factura." };
  return { ok: true };
}

/** Número visible del documento con el que se facturó un pedido. */
export async function proformaNumberFor(
  businessId: string,
  proformaId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("proformas")
    .select("number, ecf_number")
    .eq("id", proformaId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return null;
  return data.ecf_number?.trim() || data.number;
}

export interface BranchOption {
  id: string;
  name: string;
  /** ¿Es la sucursal que despacha los pedidos web? */
  isWebFulfillment?: boolean;
}

/**
 * Sucursales que pueden retirar o despachar, para los selectores del ERP.
 *
 * Aquí NO se filtra por `show_on_website`: esa columna decide qué ve el
 * público, y puertas adentro se puede despachar desde una sucursal que no esté
 * anunciada en la tienda.
 */
export async function listActiveBranches(
  businessId: string,
): Promise<BranchOption[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("branches")
    .select("id, name, public_name, is_web_fulfillment")
    .eq("business_id", businessId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.public_name?.trim() || b.name,
    // Quién despacha los pedidos web. El ERP lo necesita para comprobar la
    // existencia contra la sucursal correcta: la del pedido no significa nada
    // en un envío.
    isWebFulfillment: Boolean(b.is_web_fulfillment),
  }));
}

/** Nombre COMERCIAL de cada sucursal, para el ERP. Nunca un UUID en pantalla. */
export async function branchDisplayNames(
  businessId: string,
): Promise<Map<string, string>> {
  const admin = createServiceRoleClient();
  if (!admin) return new Map();
  return nombresDeSucursal(admin, businessId);
}

/** Nombre COMERCIAL de cada sucursal, para no enseñar UUID en pantalla. */
async function nombresDeSucursal(
  admin: Admin,
  businessId: string,
): Promise<Map<string, string>> {
  const { data } = await admin
    .from("branches")
    .select("id, name, public_name")
    .eq("business_id", businessId);
  return new Map(
    (data ?? []).map((b) => [b.id, b.public_name?.trim() || b.name]),
  );
}

/** `branches.code` es el respaldo del slug público (ver `tenant.ts`). */
async function resolverSucursal(
  admin: Admin,
  businessId: string,
  slug: string,
): Promise<string | undefined> {
  const { data } = await admin
    .from("branches")
    .select("id, code, name, public_name")
    .eq("business_id", businessId)
    .eq("show_on_website", true)
    .eq("status", "active")
    .is("deleted_at", null);
  if (!data?.length) return undefined;
  // El slug se derivó de `public_name ?? name` (ver `tenant.ts`); se rehace la
  // misma derivación en vez de fiarse del orden de la lista.
  const encontrada = data.find(
    (b) =>
      slugify(b.public_name?.trim() || b.name) === slug ||
      slugify(b.code) === slug,
  );
  return encontrada?.id;
}

/**
 * El pedido de un cliente, resuelto por su token firmado.
 *
 * Nunca por número: `WEB-000123` es correlativo y adivinable. El token lleva el
 * `business_id` dentro y firma HMAC, igual que `/factura/[token]`.
 */
export async function findWebOrderByToken(
  token: string,
): Promise<WebOrder | null> {
  // Devuelve `null` —no lanza— si la firma no cuadra, caducó o falta el
  // secreto: fail-closed por diseño.
  const claims = verifyDocumentShareToken(token);
  if (!claims) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: pedido } = await admin
    .from("web_orders")
    .select(
      "id, number, status, contact_name, contact_phone, contact_email, total, notes, created_at, branch_id, fulfillment, delivery_province, delivery_sector, delivery_address, delivery_reference, delivery_lat, delivery_lng, shipping_cost, payment_method, payment_status",
    )
    .eq("id", claims.id)
    .eq("business_id", claims.businessId)
    .maybeSingle();
  if (!pedido) return null;

  const [{ data: lineas }, { data: sucursal }] = await Promise.all([
    admin
      .from("web_order_items")
      .select("product_name, unit_price, qty, line_total")
      .eq("order_id", pedido.id)
      .order("created_at", { ascending: true }),
    admin
      .from("branches")
      .select("name, public_name")
      .eq("id", pedido.branch_id)
      .maybeSingle(),
  ]);

  const items: WebOrderItem[] = (lineas ?? []).map((l) => ({
    productName: l.product_name,
    unitPrice: Number(l.unit_price),
    qty: l.qty,
    lineTotal: Number(l.line_total),
  }));

  return {
    number: pedido.number,
    status: pedido.status as WebOrderStatus,
    branchName: sucursal?.public_name?.trim() || sucursal?.name || "Sucursal",
    fulfillment: pedido.fulfillment === "delivery" ? "delivery" : "pickup",
    deliveryProvince: provinceName(pedido.delivery_province) ?? undefined,
    deliverySector: pedido.delivery_sector ?? undefined,
    deliveryAddress: pedido.delivery_address ?? undefined,
    deliveryLat: pedido.delivery_lat ?? undefined,
    deliveryLng: pedido.delivery_lng ?? undefined,
    deliveryReference: pedido.delivery_reference ?? undefined,
    shippingCost: Number(pedido.shipping_cost ?? 0),
    paymentMethod:
      pedido.payment_method === "transferencia"
        ? "transferencia"
        : pedido.payment_method === "tarjeta"
          ? "tarjeta"
          : "efectivo",
    paymentStatus:
      pedido.payment_status === "pagado"
        ? "pagado"
        : pedido.payment_status === "reembolsado"
          ? "reembolsado"
          : "pendiente",
    contactName: pedido.contact_name,
    contactPhone: pedido.contact_phone,
    contactEmail: pedido.contact_email ?? undefined,
    total: Number(pedido.total),
    items,
    notes: pedido.notes ?? undefined,
    createdAt: pedido.created_at,
  };
}
