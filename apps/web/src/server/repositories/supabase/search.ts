import "server-only";
import type { RepoContext, SearchRepository } from "../types";
import { getClient } from "./client";
import type { SearchResultItem } from "@/features/search/search-types";
import { SEARCH_PER_GROUP } from "@/features/search/search-types";
import {
  buildGroups,
  classifyQuery,
  digitsIlikePattern,
  hasEnoughChars,
  sanitizeTerm,
} from "@/features/search/search-core";
import {
  customerItem,
  documentItem,
  lotItem,
  productItem,
} from "@/features/search/search-match";

type AnyClient = Awaited<ReturnType<typeof getClient>>;

/** Corre una sub-consulta y, si falla, degrada a `fallback` (nunca rompe el buscador). */
async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

// ─── Sub-búsquedas por entidad ───────────────────────────────────────────────

async function searchProducts(
  sb: AnyClient,
  businessId: string,
  term: string,
  wantsCatalog: boolean,
  limit: number,
): Promise<{ items: SearchResultItem[]; ids: string[] }> {
  const cols = "id,name,sku,barcode,brand_id,category_id,laboratory_id,price";
  const base = () =>
    sb.from("products").select(cols).eq("business_id", businessId).is("deleted_at", null);

  // 1) Coincidencia directa por nombre / SKU / código de barra.
  const byText = await safe(async () => {
    const { data } = await base()
      .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
      .limit(limit);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, []);

  // 2) Coincidencia por marca / categoría / laboratorio (solo texto libre).
  let byCatalog: Array<Record<string, unknown>> = [];
  if (wantsCatalog) {
    const idsFrom = async (table: string) =>
      safe(async () => {
        const { data } = await sb
          .from(table)
          .select("id")
          .eq("business_id", businessId)
          .ilike("name", `%${term}%`)
          .limit(10);
        return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      }, []);
    const [brandIds, catIds, labIds] = await Promise.all([
      idsFrom("brands"),
      idsFrom("product_categories"),
      idsFrom("laboratories"),
    ]);
    const orParts: string[] = [];
    if (brandIds.length) orParts.push(`brand_id.in.(${brandIds.join(",")})`);
    if (catIds.length) orParts.push(`category_id.in.(${catIds.join(",")})`);
    if (labIds.length) orParts.push(`laboratory_id.in.(${labIds.join(",")})`);
    if (orParts.length) {
      byCatalog = await safe(async () => {
        const { data } = await base().or(orParts.join(",")).limit(limit);
        return (data ?? []) as Array<Record<string, unknown>>;
      }, []);
    }
  }

  // Merge + dedup por id, respetando el orden (texto primero).
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const r of [...byText, ...byCatalog]) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }
  const ids = merged.map((r) => String(r.id));

  // Stock vendible por producto (una sola consulta agregada en JS).
  const stock = new Map<string, number>();
  if (ids.length) {
    const rows = await safe(async () => {
      const { data } = await sb
        .from("product_lots")
        .select("product_id,current_quantity")
        .eq("business_id", businessId)
        .in("product_id", ids)
        .eq("status", "available");
      return (data ?? []) as Array<{ product_id: string; current_quantity: number | string }>;
    }, []);
    for (const r of rows) {
      stock.set(r.product_id, (stock.get(r.product_id) ?? 0) + Number(r.current_quantity ?? 0));
    }
  }

  const items: SearchResultItem[] = merged.map((r) => {
    const id = String(r.id);
    return productItem({
      id,
      name: (r.name as string) ?? "Producto",
      sku: (r.sku as string) ?? undefined,
      barcode: (r.barcode as string) ?? undefined,
      stock: stock.get(id) ?? 0,
    });
  });
  return { items, ids };
}

async function searchCustomers(
  sb: AnyClient,
  businessId: string,
  term: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const digitPattern = digitsIlikePattern(term);
  const orParts = [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `email.ilike.%${term}%`,
    `customer_number.ilike.%${term}%`,
  ];
  // Teléfono / WhatsApp / documento: patrón tolerante a separadores (031-…-2).
  if (digitPattern) {
    orParts.push(
      `phone.ilike.${digitPattern}`,
      `whatsapp.ilike.${digitPattern}`,
      `document_number.ilike.${digitPattern}`,
    );
  }
  const rows = await safe(async () => {
    const { data } = await sb
      .from("clients")
      .select("id,customer_number,first_name,last_name,phone,whatsapp,document_number,email")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .or(orParts.join(","))
      .limit(limit);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, []);
  return rows.map((r) =>
    customerItem({
      id: String(r.id),
      customerNumber: (r.customer_number as string) ?? undefined,
      firstName: (r.first_name as string) ?? "",
      lastName: (r.last_name as string) ?? "",
      phone: (r.phone as string) ?? undefined,
      whatsapp: (r.whatsapp as string) ?? undefined,
      documentNumber: (r.document_number as string) ?? undefined,
      email: (r.email as string) ?? undefined,
    }),
  );
}

async function searchDocuments(
  sb: AnyClient,
  businessId: string,
  term: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await safe(async () => {
    const { data } = await sb
      .from("proformas")
      .select("id,number,ecf_number,customer_name,total,document_kind,ecf_type,status,created_at")
      .eq("business_id", businessId)
      .or(
        `number.ilike.%${term}%,ecf_number.ilike.%${term}%,customer_name.ilike.%${term}%`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, []);
  return rows.map((r) =>
    documentItem({
      id: String(r.id),
      number: (r.number as string) ?? undefined,
      ecfNumber: (r.ecf_number as string) ?? undefined,
      customerName: (r.customer_name as string) ?? undefined,
      total: Number(r.total ?? 0),
      documentKind: (r.document_kind as string) ?? "proforma",
    }),
  );
}

async function searchLots(
  sb: AnyClient,
  businessId: string,
  term: string,
  matchedProductIds: string[],
  limit: number,
): Promise<SearchResultItem[]> {
  const cols =
    "id,product_id,lot_number,branch_id,expires_at,current_quantity,status";
  const byNumber = await safe(async () => {
    const { data } = await sb
      .from("product_lots")
      .select(cols)
      .eq("business_id", businessId)
      .ilike("lot_number", `%${term}%`)
      .limit(limit);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, []);

  // Lotes de productos que matchearon por nombre/SKU ("producto asociado").
  let byProduct: Array<Record<string, unknown>> = [];
  if (matchedProductIds.length) {
    byProduct = await safe(async () => {
      const { data } = await sb
        .from("product_lots")
        .select(cols)
        .eq("business_id", businessId)
        .in("product_id", matchedProductIds.slice(0, 20))
        .limit(limit);
      return (data ?? []) as Array<Record<string, unknown>>;
    }, []);
  }

  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const r of [...byNumber, ...byProduct]) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }
  if (merged.length === 0) return [];

  // Resolver nombre de producto y de sucursal para el display (2 consultas).
  const productIds = [...new Set(merged.map((r) => String(r.product_id)))];
  const branchIds = [...new Set(merged.map((r) => String(r.branch_id)).filter(Boolean))];
  const [prodNames, branchNames] = await Promise.all([
    safe(async () => {
      const { data } = await sb
        .from("products")
        .select("id,name")
        .eq("business_id", businessId)
        .in("id", productIds);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; name: string }>) m.set(r.id, r.name);
      return m;
    }, new Map<string, string>()),
    branchIds.length
      ? safe(async () => {
          const { data } = await sb
            .from("branches")
            .select("id,name")
            .eq("business_id", businessId)
            .in("id", branchIds);
          const m = new Map<string, string>();
          for (const r of (data ?? []) as Array<{ id: string; name: string }>) m.set(r.id, r.name);
          return m;
        }, new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ]);

  return merged.map((r) => {
    const productId = String(r.product_id);
    return lotItem({
      id: String(r.id),
      productId,
      lotNumber: (r.lot_number as string) ?? "",
      productName: prodNames.get(productId) ?? undefined,
      branchName: branchNames.get(String(r.branch_id)) ?? undefined,
      currentQuantity: Number(r.current_quantity ?? 0),
      expiresAt: (r.expires_at as string) ?? undefined,
      status: String(r.status),
    });
  });
}

// ─── Repositorio ─────────────────────────────────────────────────────────────

export const searchRepository: SearchRepository = {
  async global(ctx: RepoContext, query: string, opts) {
    const term = sanitizeTerm(query);
    const perGroup = opts?.perGroup ?? SEARCH_PER_GROUP;
    if (!hasEnoughChars(term)) return { query: term, groups: [], total: 0 };

    const sb = await getClient("search.global");
    const cls = classifyQuery(term);
    // Catálogo (marca/categoría/laboratorio) solo para texto libre — evita
    // consultas extra en búsquedas de SKU / código de barra / documento.
    const wantsCatalog =
      /[a-zA-Z]/.test(term) && !cls.looksLikeSku && !cls.looksLikeDocument;
    const perFetch = perGroup + 2; // trae un poco más y buildGroups recorta.

    // Ola 1: productos (+ su stock e ids), clientes y documentos en paralelo.
    const [products, customers, documents] = await Promise.all([
      searchProducts(sb, ctx.businessId, term, wantsCatalog, perFetch),
      searchCustomers(sb, ctx.businessId, term, perFetch),
      searchDocuments(sb, ctx.businessId, term, perFetch * 2),
    ]);

    // Ola 2: lotes (por número y por los productos que matchearon).
    const lots = await searchLots(sb, ctx.businessId, term, products.ids, perFetch);

    const all: SearchResultItem[] = [
      ...products.items,
      ...customers,
      ...documents,
      ...lots,
    ];
    return buildGroups(term, all, perGroup);
  },
};
