import "server-only";
import { buildCartSummary, parseCartItems } from "@/features/storefront/cart";
import type {
  WebOrder,
  WebOrderItem,
} from "@/features/storefront/orders/types";
import {
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
} from "@/features/storefront/shipping/quote";
import { loadPublishedCatalog } from "./catalog";
import { loadShippingRates } from "./shipping";
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
  /** `efectivo` = paga al recibir o retirar. `transferencia` = sube comprobante. */
  paymentMethod?: "efectivo" | "transferencia";
  /** Solo cuando es envío. El COSTE lo pone el servidor, nunca el navegador. */
  province?: string;
  sector?: string;
  address?: string;
  reference?: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  /** Un doble clic en "Enviar pedido" no puede crear dos pedidos. */
  idempotencyKey: string;
}

export type CreateWebOrderResult =
  | { ok: true; token: string; number: string }
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

  const numero = await siguienteNumero(admin);
  if (!numero) return { ok: false, error: "No se pudo registrar el pedido." };

  const { data: pedido, error } = await admin
    .from("web_orders")
    .insert({
      business_id: tenant.businessId,
      branch_id: branchId,
      number: numero,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail ?? null,
      fulfillment: esEnvio ? "delivery" : "pickup",
      payment_method:
        input.paymentMethod === "transferencia" ? "transferencia" : "efectivo",
      delivery_province: direccion?.ok ? direccion.value.province : null,
      delivery_sector: direccion?.ok ? direccion.value.sector : null,
      delivery_address: direccion?.ok ? direccion.value.address : null,
      delivery_reference: direccion?.ok ? (direccion.value.reference ?? null) : null,
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

/** El pedido completo, para el detalle del ERP. Acotado por `business_id`. */
export async function getWebOrderForBusiness(
  businessId: string,
  id: string,
): Promise<(WebOrder & { id: string }) | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: pedido } = await admin
    .from("web_orders")
    .select(
      "id, number, status, contact_name, contact_phone, contact_email, total, notes, created_at, branch_id, fulfillment, delivery_province, delivery_sector, delivery_address, delivery_reference, shipping_cost, payment_method, payment_status",
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!pedido) return null;

  const [{ data: lineas }, nombres] = await Promise.all([
    admin
      .from("web_order_items")
      .select("product_name, unit_price, qty, line_total")
      .eq("order_id", pedido.id)
      .order("created_at", { ascending: true }),
    nombresDeSucursal(admin, businessId),
  ]);

  return {
    id: pedido.id,
    number: pedido.number,
    status: pedido.status as WebOrderStatus,
    branchName: nombres.get(pedido.branch_id) ?? "—",
    fulfillment: pedido.fulfillment === "delivery" ? "delivery" : "pickup",
    deliveryProvince: provinceName(pedido.delivery_province) ?? undefined,
    deliverySector: pedido.delivery_sector ?? undefined,
    deliveryAddress: pedido.delivery_address ?? undefined,
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
      "id, number, status, contact_name, contact_phone, contact_email, total, notes, created_at, branch_id, fulfillment, delivery_province, delivery_sector, delivery_address, delivery_reference, shipping_cost, payment_method, payment_status",
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
