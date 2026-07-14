import "server-only";
import { getRepositories } from "@/server/repositories";
import type { RepoContext } from "@/server/repositories/types";
import type { AIToolInvocation } from "./providers/types";
import { ALLOWED_TOOLS, validateToolSet, type Tool } from "./tools";

/**
 * Ejecutor de tools del chat IA: consulta datos REALES del negocio vía los
 * repositorios (RLS + filtro business_id del ctx — nunca del modelo).
 *
 * Solo LECTURA en este canal: las tools de efecto (WhatsApp, handoff) no se
 * exponen al modelo por chat. Los resultados van compactos (JSON acotado) para
 * no quemar tokens ni filtrar datos innecesarios.
 */
export const CHAT_READ_TOOLS = new Set([
  "get_client",
  "search_products",
  "get_inventory_stock",
  "get_product_lots",
  "get_expiring_lots",
  "get_sales_summary",
]);

const MAX_ROWS = 25;

/** Specs de tools para el chat: permitidas por el agente ∩ solo-lectura. */
export function chatToolSpecs(toolsAllowed: string[]): Tool[] {
  const specs = ALLOWED_TOOLS.filter(
    (t) => toolsAllowed.includes(t.name) && CHAT_READ_TOOLS.has(t.name),
  );
  validateToolSet(specs); // defensa en profundidad (spec §20: sin agendamiento)
  return specs;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const int = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
// El modelo a veces inventa parámetros ("principal", "este-mes"): Postgres los
// rechaza (22P02/22007) y se cae toda la consulta. Se sanean ANTES de la BD.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = (v: unknown): string | undefined => {
  const s = str(v);
  return s && UUID_RE.test(s) ? s : undefined;
};
const dateStr = (v: unknown): string | undefined => {
  const s = str(v);
  return s && DATE_RE.test(s) ? s : undefined;
};
const BAD_ID = { error: "Id inválido: usa el id exacto devuelto por search_products." };

/** Crea el ejecutor ligado a la sesión (tenant) actual. Devuelve JSON string. */
export function makeChatToolExecutor(ctx: RepoContext) {
  const repos = getRepositories();

  async function productName(id: string): Promise<string> {
    const p = await repos.product.byId(ctx, id).catch(() => null);
    return p?.name ?? id;
  }

  async function run(call: AIToolInvocation): Promise<unknown> {
    const a = call.arguments ?? {};
    switch (call.name) {
      case "search_products": {
        const query = str(a.query);
        if (!query) return { error: "Falta query." };
        const products = await repos.product.list(ctx, {
          search: query,
          limit: int(a.limit, 10, 1, MAX_ROWS),
          activeOnly: true,
        });
        // Política del negocio: solo se RECOMIENDAN productos con existencia.
        // Los agotados se listan aparte (solo nombre) para poder decir
        // "está agotado" sin que el modelo los ofrezca.
        const withStock = await Promise.all(
          products.map(async (p) => ({
            id: p.id, sku: p.sku, name: p.name, price: p.price, unit: p.unit,
            stock: await repos.product.totalStock(ctx, p.id).catch(() => 0),
          })),
        );
        return {
          disponibles: withStock.filter((p) => p.stock > 0),
          agotados: withStock.filter((p) => p.stock <= 0).map((p) => p.name),
        };
      }

      case "get_inventory_stock": {
        const productId = uuid(a.product_id);
        if (!productId) return str(a.product_id) ? BAD_ID : { error: "Falta product_id." };
        const [product, totalStock] = await Promise.all([
          repos.product.byId(ctx, productId),
          repos.product.totalStock(ctx, productId),
        ]);
        if (!product) return { error: "Producto no encontrado." };
        return { productId, name: product.name, sku: product.sku, totalStock };
      }

      case "get_product_lots": {
        const productId = uuid(a.product_id);
        if (!productId) return str(a.product_id) ? BAD_ID : { error: "Falta product_id." };
        const lots = await repos.productLot.list(ctx, { productId });
        return lots.slice(0, MAX_ROWS).map((l) => ({
          lotNumber: l.lotNumber, expiresAt: l.expiresAt,
          currentQuantity: l.currentQuantity, status: l.status,
        }));
      }

      case "get_expiring_lots": {
        const days = int(a.days, 30, 1, 365);
        const [expired, expiring] = await Promise.all([
          repos.productLot.list(ctx, { expiredOnly: true }),
          repos.productLot.list(ctx, { expiringWithinDays: days }),
        ]);
        const withStock = (l: (typeof expired)[number]) => l.currentQuantity > 0;
        const compact = async (lots: typeof expired) =>
          Promise.all(
            lots.filter(withStock).slice(0, MAX_ROWS).map(async (l) => ({
              product: await productName(l.productId),
              lotNumber: l.lotNumber, expiresAt: l.expiresAt,
              currentQuantity: l.currentQuantity, status: l.status,
            })),
          );
        return {
          vencidos: await compact(expired),
          vencidosTotal: expired.filter(withStock).length,
          porVencer: await compact(expiring),
          porVencerTotal: expiring.filter(withStock).length,
          diasVentana: days,
        };
      }

      case "get_client": {
        const identifier = str(a.identifier);
        if (!identifier) return { error: "Falta identifier." };
        const kind = str(a.kind);
        const customer =
          kind === "id" && uuid(identifier)
            ? await repos.customer.byId(ctx, identifier)
            : (await repos.customer.list(ctx, { search: identifier }))[0] ?? null;
        if (!customer) return { error: "Cliente no encontrado." };
        return {
          id: customer.id, customerNumber: customer.customerNumber,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          phone: customer.phone, email: customer.email, tags: customer.tags,
        };
      }

      case "get_sales_summary": {
        // Solo fechas YYYY-MM-DD y branch UUID reales; lo demás se ignora.
        const from = dateStr(a.from);
        const to = dateStr(a.to);
        const headers = await repos.proforma.listHeaders(ctx, {
          from, to, branchId: uuid(a.branch_id),
        });
        const valid = headers.filter((h) => h.status !== "cancelled");
        return {
          ventas: valid.length,
          totalDOP: Math.round(valid.reduce((s, h) => s + h.total, 0) * 100) / 100,
          anuladas: headers.length - valid.length,
          desde: from ?? null, hasta: to ?? null,
          ...(str(a.from) && !from ? { aviso: "from inválido (usa YYYY-MM-DD); se ignoró" } : {}),
          ...(str(a.to) && !to ? { aviso_to: "to inválido (usa YYYY-MM-DD); se ignoró" } : {}),
        };
      }

      default:
        return { error: `Herramienta no disponible en este canal: ${call.name}.` };
    }
  }

  return async (call: AIToolInvocation): Promise<string> => {
    try {
      return JSON.stringify(await run(call));
    } catch (e) {
      // Nunca romper el chat por una tool: el modelo recibe el error y sigue.
      return JSON.stringify({
        error: e instanceof Error ? e.message.slice(0, 200) : "La consulta falló.",
      });
    }
  };
}
