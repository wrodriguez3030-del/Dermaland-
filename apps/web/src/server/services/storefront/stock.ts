import "server-only";
import {
  sellableByProduct,
  webAvailability,
  type WebAvailability,
  type WebStockLot,
} from "@/features/storefront/stock";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";

/**
 * Existencia real de un puñado de productos, EN ESTE MOMENTO.
 *
 * Deliberadamente SIN caché. El catálogo sí la tiene —cinco minutos, y ahí un
 * "En existencia" un poco viejo no hace daño—, pero esto es lo que decide si un
 * pedido se acepta. Una existencia de hace cinco minutos aceptaría el último
 * frasco dos veces.
 *
 * Es service-role acotado por `business_id`, igual que el resto del módulo
 * público: la clave anónima viaja en el navegador y abrir `product_lots` a
 * `anon` dejaría leer el inventario entero del negocio.
 */

/** Cuántos ids caben en un `in.(…)`: la consulta viaja en la URL de un GET. */
const ID_CHUNK = 150;

/**
 * Estados de pedido que todavía tienen mercancía apalabrada.
 *
 * `entregado` y `cancelado` quedan fuera: uno ya salió por la puerta y el otro
 * no va a salir. Contarlos escondería existencia que sí está.
 */
const ESTADOS_ABIERTOS = ["recibido", "confirmado", "preparando", "listo"];

function chunk<T>(items: readonly T[], size: number): T[][] {
  const partes: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    partes.push(items.slice(i, i + size));
  return partes;
}

/** Lotes vendibles de esos productos. Filtra en la base y suma en memoria. */
async function cargarLotes(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  businessId: string,
  productIds: readonly string[],
  hoy: string,
): Promise<WebStockLot[]> {
  const lotes: WebStockLot[] = [];
  for (const parte of chunk(productIds, ID_CHUNK)) {
    const filas = await fetchAllPages<{
      product_id: string;
      branch_id: string;
      status: string;
      current_quantity: number;
      expires_at: string | null;
    }>(async (from, to) => {
      const { data, error } = await admin
        .from("product_lots")
        .select("product_id, branch_id, status, current_quantity, expires_at")
        .eq("business_id", businessId)
        .eq("status", "available")
        .gt("current_quantity", 0)
        .gte("expires_at", hoy)
        .in("product_id", parte)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });
    for (const f of filas) {
      lotes.push({
        productId: f.product_id,
        branchId: f.branch_id,
        status: f.status,
        currentQuantity: f.current_quantity,
        expiresAt: f.expires_at,
      });
    }
  }
  return lotes;
}

/**
 * Unidades apalabradas en pedidos web abiertos y todavía sin facturar.
 *
 * Se excluyen los que ya tienen proforma: en cuanto se facturan, el POS
 * descuenta el inventario de verdad, así que seguir contándolos aquí restaría
 * dos veces la misma mercancía.
 */
/**
 * Lo apalabrado de TODO el catálogo, sin filtrar por producto.
 *
 * Existe para que el catálogo cuente igual que el checkout. Antes no lo hacía:
 * el catálogo sumaba lotes a secas y el checkout restaba además lo apalabrado,
 * así que un producto cuyo último frasco estaba comprometido en un pedido
 * abierto se anunciaba disponible y luego el checkout lo rechazaba con
 * "se nos acabó". El cliente veía un producto que el sistema no le iba a vender.
 *
 * No filtra por producto a propósito: el catálogo los quiere todos, y el coste
 * lo marca el número de PEDIDOS ABIERTOS —unos pocos— y no el de productos.
 */
export async function committedUnitsForCatalog(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  businessId: string,
): Promise<Map<string, number>> {
  const abiertos = await fetchAllPages<{ id: string }>(async (from, to) => {
    const { data, error } = await admin
      .from("web_orders")
      .select("id")
      .eq("business_id", businessId)
      .in("status", ESTADOS_ABIERTOS)
      .is("proforma_id", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });

  const comprometido = new Map<string, number>();
  const ids = abiertos.map((o) => o.id);
  if (ids.length === 0) return comprometido;

  for (const partePedidos of chunk(ids, ID_CHUNK)) {
    const filas = await fetchAllPages<{ product_id: string; qty: number }>(
      async (from, to) => {
        const { data, error } = await admin
          .from("web_order_items")
          .select("product_id, qty")
          .eq("business_id", businessId)
          .in("order_id", partePedidos)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      },
    );
    for (const f of filas) {
      comprometido.set(
        f.product_id,
        (comprometido.get(f.product_id) ?? 0) + f.qty,
      );
    }
  }
  return comprometido;
}

async function cargarComprometido(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  businessId: string,
  productIds: readonly string[],
  excludeOrderId?: string,
): Promise<Map<string, number>> {
  const abiertos = await fetchAllPages<{ id: string }>(async (from, to) => {
    const { data, error } = await admin
      .from("web_orders")
      .select("id")
      .eq("business_id", businessId)
      .in("status", ESTADOS_ABIERTOS)
      .is("proforma_id", null)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });

  const ids = abiertos
    .map((o) => o.id)
    .filter((id) => id !== excludeOrderId);
  const comprometido = new Map<string, number>();
  if (ids.length === 0) return comprometido;

  for (const parteProductos of chunk(productIds, ID_CHUNK)) {
    for (const partePedidos of chunk(ids, ID_CHUNK)) {
      const filas = await fetchAllPages<{ product_id: string; qty: number }>(
        async (from, to) => {
          const { data, error } = await admin
            .from("web_order_items")
            .select("product_id, qty")
            .eq("business_id", businessId)
            .in("order_id", partePedidos)
            .in("product_id", parteProductos)
            .order("id", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data ?? [];
        },
      );
      for (const f of filas) {
        comprometido.set(
          f.product_id,
          (comprometido.get(f.product_id) ?? 0) + f.qty,
        );
      }
    }
  }
  return comprometido;
}

/**
 * Cuánto se puede vender de cada producto ahora mismo.
 *
 * Si la consulta falla devuelve un mapa VACÍO, y `checkOrderStock` trata lo que
 * no está en el mapa como agotado. Es a propósito: ante un error de lectura del
 * inventario, parar el pedido es recuperable —el cliente reintenta— y vender a
 * ciegas no lo es.
 *
 * @param excludeOrderId Pedido que NO cuenta como compromiso ajeno. Se usa al
 *   mirar un pedido concreto en el ERP: sus propias líneas no compiten consigo
 *   mismas.
 */
export async function loadWebAvailability(
  businessId: string,
  productIds: readonly string[],
  opts: { excludeOrderId?: string } = {},
): Promise<Map<string, WebAvailability>> {
  const unicos = [...new Set(productIds)].filter(Boolean);
  if (unicos.length === 0) return new Map();

  const admin = createServiceRoleClient();
  if (!admin) return new Map();

  const hoy = new Date().toISOString().slice(0, 10);

  try {
    const [lotes, comprometido] = await Promise.all([
      cargarLotes(admin, businessId, unicos, hoy),
      cargarComprometido(admin, businessId, unicos, opts.excludeOrderId),
    ]);

    const existencias = sellableByProduct(lotes, hoy);
    return new Map(
      unicos.map((id) => [
        id,
        webAvailability(existencias.get(id), comprometido.get(id) ?? 0),
      ]),
    );
  } catch {
    return new Map();
  }
}
