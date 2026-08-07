import "server-only";
import { revalidateTag } from "next/cache";
import { publishBlockers } from "@/features/storefront/publishability";
import { productSlug } from "@/features/storefront/slug";
import { env } from "@/lib/env";
import { getClient } from "@/server/repositories/supabase/client";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import { getRepositories } from "@/server/repositories";
import type { RepoContext } from "@/server/repositories/types";
import { STOREFRONT_CATALOG_TAG } from "./catalog";
import { publicImageUrl } from "./public-product";
import { STOREFRONT_TENANT_TAG } from "./tenant";

/**
 * Administración del catálogo web (ERP), al otro lado de la frontera.
 *
 * Diferencias deliberadas con la lectura pública:
 *
 *  · Aquí se escribe con el cliente NORMAL (la sesión del usuario), no con
 *    service-role. Las políticas de RLS de `product_web_meta` y
 *    `business_web_settings` ya acotan por `business_id`; usar service-role para
 *    ahorrarse eso sería quitar la red de seguridad justo donde se escribe. El
 *    rol se comprueba en la ruta con `authorizeRole`.
 *
 *  · Aquí SÍ se ven los productos que no se pueden publicar, con el motivo
 *    escrito. La tienda los omite en silencio; el administrador necesita saber
 *    por qué su producto no aparece.
 *
 * Toda escritura invalida la caché de la tienda. Sin eso, el administrador
 * publica un producto, va a mirar y no lo ve —hasta cinco minutos después—, y
 * concluye que el botón no funciona.
 */

/** Producto tal como lo ve el administrador del catálogo web. */
export interface AdminWebProduct {
  productId: string;
  slug: string;
  /** Nombre del catálogo del ERP (viene en mayúsculas). */
  name: string;
  brandName: string | null;
  price: number;
  imageUrl: string | null;
  visible: boolean;
  featured: boolean;
  isNew: boolean;
  /** Vacío = se puede publicar. Con contenido = por qué no. */
  blockers: string[];
  webTitle: string | null;
  webSummary: string | null;
  webDescription: string | null;
  benefits: string[];
  howToUse: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  imageAlt: string | null;
}

export interface StorefrontSettings {
  businessId: string;
  storefrontEnabled: boolean;
  siteName: string;
  tagline: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  whatsappPhone: string | null;
  contactEmail: string | null;
  /** Árbol de enlaces del negocio (Linktree, Beacons, su propia web). */
  linktreeUrl: string | null;
}

export interface AdminWebCatalog {
  settings: StorefrontSettings | null;
  products: AdminWebProduct[];
  /** Cuántos están publicados ahora mismo. */
  publishedCount: number;
  /** Cuántos podrían publicarse pero están ocultos. */
  publishableCount: number;
}

/** Ids por consulta: viajan en la URL de un GET. */
const ID_CHUNK = 150;

const META_COLUMNS =
  "product_id, slug, visible, featured, is_new, web_title, web_summary, web_description, benefits, how_to_use, seo_title, seo_description, image_alt";
const PRODUCT_COLUMNS =
  "id, name, price, image_url, brand_id, active, sellable, deleted_at, requires_prescription, controlled";

/** Campos editables de la ficha web. Lista blanca de ENTRADA. */
export interface ProductWebMetaPatch {
  visible?: boolean;
  featured?: boolean;
  isNew?: boolean;
  webTitle?: string | null;
  webSummary?: string | null;
  webDescription?: string | null;
  benefits?: string[];
  howToUse?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageAlt?: string | null;
}

/** Campos editables de la configuración de la tienda. */
export interface StorefrontSettingsPatch {
  storefrontEnabled?: boolean;
  siteName?: string;
  tagline?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  whatsappPhone?: string | null;
  contactEmail?: string | null;
  linktreeUrl?: string | null;
}

function texto(valor: string | null | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/** Todo lo que el administrador necesita ver en una sola pantalla. */
export async function loadAdminWebCatalog(
  ctx: RepoContext,
): Promise<AdminWebCatalog> {
  const sb = await getClient("storefront.adminCatalog");
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

  const [ajustes, metas] = await Promise.all([
    loadSettings(ctx),
    fetchAllPages<Record<string, never>>(async (from, to) => {
      const { data, error } = await sb
        .from("product_web_meta")
        .select(META_COLUMNS)
        .eq("business_id", ctx.businessId)
        .order("product_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, never>[];
    }),
  ]);

  if (metas.length === 0) {
    return {
      settings: ajustes,
      products: [],
      publishedCount: 0,
      publishableCount: 0,
    };
  }

  const ids = metas.map((m) => m.product_id as unknown as string);
  // Trocear a mano y NO con `fetchAllPages`: ese helper corta cuando una página
  // devuelve menos filas de las pedidas, y aquí un trozo de 150 ids puede
  // devolver 149 productos legítimamente (uno borrado). Se perderían todos los
  // ids siguientes sin ningún error.
  const productos: Record<string, never>[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await sb
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("business_id", ctx.businessId)
      .in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw error;
    productos.push(...((data ?? []) as unknown as Record<string, never>[]));
  }

  const marcaIds = [
    ...new Set(
      productos
        .map((p) => p.brand_id as unknown as string | null)
        .filter(Boolean),
    ),
  ] as string[];
  const marcas = new Map<string, string>();
  if (marcaIds.length > 0) {
    const { data } = await sb
      .from("brands")
      .select("id, name")
      .eq("business_id", ctx.businessId)
      .in("id", marcaIds);
    for (const marca of data ?? []) marcas.set(marca.id, marca.name);
  }

  const porId = new Map(productos.map((p) => [p.id as unknown as string, p]));
  const products: AdminWebProduct[] = [];
  for (const meta of metas) {
    const p = porId.get(meta.product_id as unknown as string);
    if (!p) continue;
    const fila = p as unknown as {
      name: string;
      price: number;
      image_url: string | null;
      brand_id: string | null;
      active: boolean;
      sellable: boolean;
      deleted_at: string | null;
      requires_prescription: boolean;
      controlled: boolean;
    };
    const m = meta as unknown as {
      product_id: string;
      slug: string;
      visible: boolean;
      featured: boolean;
      is_new: boolean;
      web_title: string | null;
      web_summary: string | null;
      web_description: string | null;
      benefits: string[];
      how_to_use: string | null;
      seo_title: string | null;
      seo_description: string | null;
      image_alt: string | null;
    };
    const foto = publicImageUrl(fila.image_url, supabaseUrl);

    products.push({
      productId: m.product_id,
      slug: m.slug,
      name: fila.name,
      brandName: fila.brand_id ? (marcas.get(fila.brand_id) ?? null) : null,
      price: fila.price,
      imageUrl: foto,
      visible: m.visible,
      featured: m.featured,
      isNew: m.is_new,
      blockers: publishBlockers({
        active: fila.active,
        sellable: fila.sellable,
        deletedAt: fila.deleted_at,
        price: fila.price,
        requiresPrescription: fila.requires_prescription,
        controlled: fila.controlled,
        hasValidImage: !!foto,
      }),
      webTitle: m.web_title,
      webSummary: m.web_summary,
      webDescription: m.web_description,
      benefits: m.benefits ?? [],
      howToUse: m.how_to_use,
      seoTitle: m.seo_title,
      seoDescription: m.seo_description,
      imageAlt: m.image_alt,
    });
  }

  products.sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    settings: ajustes,
    products,
    publishedCount: products.filter((p) => p.visible).length,
    publishableCount: products.filter(
      (p) => !p.visible && p.blockers.length === 0,
    ).length,
  };
}

/** Configuración de la tienda del negocio, o `null` si aún no existe. */
export async function loadSettings(
  ctx: RepoContext,
): Promise<StorefrontSettings | null> {
  const sb = await getClient("storefront.settings");
  const { data, error } = await sb
    .from("business_web_settings")
    .select(
      "business_id, storefront_enabled, site_name, tagline, seo_title, seo_description, whatsapp_phone, contact_email, linktree_url",
    )
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    businessId: data.business_id,
    storefrontEnabled: data.storefront_enabled,
    siteName: data.site_name,
    tagline: data.tagline,
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    whatsappPhone: data.whatsapp_phone,
    contactEmail: data.contact_email,
    linktreeUrl: data.linktree_url,
  };
}

/**
 * Guarda la configuración de la tienda.
 *
 * `upsert` y no `update`: un negocio que nunca tocó la tienda no tiene fila, y
 * hacer que el primer guardado falle en silencio sería el peor primer contacto
 * posible con la pantalla.
 */
export async function updateStorefrontSettings(
  ctx: RepoContext,
  patch: StorefrontSettingsPatch,
): Promise<StorefrontSettings> {
  const sb = await getClient("storefront.updateSettings");
  const fila: Record<string, unknown> = {
    business_id: ctx.businessId,
    updated_at: new Date().toISOString(),
  };
  if (patch.storefrontEnabled !== undefined)
    fila.storefront_enabled = patch.storefrontEnabled;
  if (patch.siteName !== undefined)
    fila.site_name = patch.siteName.trim() || "DermaLand";
  if (patch.tagline !== undefined) fila.tagline = texto(patch.tagline);
  if (patch.seoTitle !== undefined) fila.seo_title = texto(patch.seoTitle);
  if (patch.seoDescription !== undefined)
    fila.seo_description = texto(patch.seoDescription);
  if (patch.whatsappPhone !== undefined)
    fila.whatsapp_phone = texto(patch.whatsappPhone);
  if (patch.contactEmail !== undefined)
    fila.contact_email = texto(patch.contactEmail);
  if (patch.linktreeUrl !== undefined)
    fila.linktree_url = texto(patch.linktreeUrl);
  if (ctx.userId) fila.updated_by = ctx.userId;

  const { error } = await sb.from("business_web_settings").upsert(fila, {
    onConflict: "business_id",
  });
  if (error) throw error;

  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action:
      patch.storefrontEnabled === true
        ? "storefront.enabled"
        : patch.storefrontEnabled === false
          ? "storefront.disabled"
          : "storefront.settings_update",
    entity: "storefront",
    entityId: ctx.businessId,
    metadata: patch as unknown as Record<string, unknown>,
  });

  revalidateTag(STOREFRONT_TENANT_TAG);
  revalidateTag(STOREFRONT_CATALOG_TAG);

  const actualizado = await loadSettings(ctx);
  if (!actualizado)
    throw new Error("No se pudo leer la configuración recién guardada.");
  return actualizado;
}

/**
 * Cambia la ficha web de UN producto.
 *
 * El slug no se toca nunca aquí: es estable por diseño y regenerarlo rompería
 * los enlaces ya compartidos por WhatsApp y la indexación en Google
 * (`docs/tienda-en-linea.md` §3.2).
 *
 * Publicar exige que el producto sea publicable AHORA. Sin esta comprobación se
 * podría marcar visible un producto sin precio: la tienda lo omitiría igual
 * —fail-closed— pero el administrador vería el interruptor encendido y creería
 * que está publicado.
 */
export async function updateProductWebMeta(
  ctx: RepoContext,
  productId: string,
  patch: ProductWebMetaPatch,
): Promise<{ ok: true } | { ok: false; blockers: string[] }> {
  const sb = await getClient("storefront.updateProductMeta");

  if (patch.visible === true) {
    const catalogo = await loadAdminWebCatalog(ctx);
    const producto = catalogo.products.find((p) => p.productId === productId);
    if (!producto)
      return {
        ok: false,
        blockers: ["El producto no está en el catálogo web"],
      };
    if (producto.blockers.length > 0)
      return { ok: false, blockers: producto.blockers };
  }

  const fila: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.visible !== undefined) {
    fila.visible = patch.visible;
    // Se sella la primera publicación; despublicar no borra la fecha, para no
    // perder el dato de cuándo se estrenó.
    if (patch.visible) fila.published_at = new Date().toISOString();
  }
  if (patch.featured !== undefined) fila.featured = patch.featured;
  if (patch.isNew !== undefined) fila.is_new = patch.isNew;
  if (patch.webTitle !== undefined) fila.web_title = texto(patch.webTitle);
  if (patch.webSummary !== undefined)
    fila.web_summary = texto(patch.webSummary);
  if (patch.webDescription !== undefined)
    fila.web_description = texto(patch.webDescription);
  if (patch.benefits !== undefined) {
    // El CHECK de la columna admite 8; recortar aquí evita un error de base con
    // un mensaje que nadie entendería.
    fila.benefits = patch.benefits
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (patch.howToUse !== undefined) fila.how_to_use = texto(patch.howToUse);
  if (patch.seoTitle !== undefined) fila.seo_title = texto(patch.seoTitle);
  if (patch.seoDescription !== undefined)
    fila.seo_description = texto(patch.seoDescription);
  if (patch.imageAlt !== undefined) fila.image_alt = texto(patch.imageAlt);
  if (ctx.userId) fila.updated_by = ctx.userId;

  // `.select()` obligatorio: un UPDATE que no toca ninguna fila devuelve éxito
  // sin `error`, y el administrador vería "guardado" sin haber guardado nada.
  const { data, error } = await sb
    .from("product_web_meta")
    .update(fila)
    .eq("business_id", ctx.businessId)
    .eq("product_id", productId)
    .select("product_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    return { ok: false, blockers: ["El producto no está en el catálogo web"] };
  }

  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action:
      patch.visible === true
        ? "storefront.product_published"
        : patch.visible === false
          ? "storefront.product_unpublished"
          : "storefront.product_content_update",
    entity: "product",
    entityId: productId,
    metadata: patch as unknown as Record<string, unknown>,
  });

  revalidateTag(STOREFRONT_CATALOG_TAG);
  return { ok: true };
}

/**
 * Publica o retira VARIOS productos de una vez.
 *
 * Sin esto el módulo no es usable: el catálogo sembrado son 638 fichas y
 * encenderlas de una en una son 638 clics. Publicar en lote NO relaja la regla
 * —cada producto pasa por `publishBlockers`— y devuelve los que se quedaron
 * fuera con su motivo, para que el resultado sea "618 publicados, 20 no
 * pudieron y aquí está por qué" y no un silencio.
 */
export async function setVisibilityBulk(
  ctx: RepoContext,
  productIds: readonly string[],
  visible: boolean,
): Promise<{
  updated: number;
  skipped: { productId: string; name: string; blockers: string[] }[];
}> {
  const sb = await getClient("storefront.setVisibilityBulk");
  const catalogo = await loadAdminWebCatalog(ctx);
  const porId = new Map(catalogo.products.map((p) => [p.productId, p]));

  const aplicables: string[] = [];
  const skipped: { productId: string; name: string; blockers: string[] }[] = [];
  for (const id of productIds) {
    const producto = porId.get(id);
    if (!producto) {
      skipped.push({
        productId: id,
        name: id,
        blockers: ["No está en el catálogo web"],
      });
      continue;
    }
    // Retirar siempre se puede; publicar solo lo que hoy es publicable.
    if (visible && producto.blockers.length > 0) {
      skipped.push({
        productId: id,
        name: producto.name,
        blockers: producto.blockers,
      });
      continue;
    }
    aplicables.push(id);
  }

  const ahora = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < aplicables.length; i += ID_CHUNK) {
    const grupo = aplicables.slice(i, i + ID_CHUNK);
    const fila: Record<string, unknown> = { visible, updated_at: ahora };
    if (visible) fila.published_at = ahora;
    if (ctx.userId) fila.updated_by = ctx.userId;

    const { data, error } = await sb
      .from("product_web_meta")
      .update(fila)
      .eq("business_id", ctx.businessId)
      .in("product_id", grupo)
      .select("product_id");
    if (error) throw error;
    updated += data?.length ?? 0;
  }

  if (updated > 0) {
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: ctx.userId ?? "",
      userName: ctx.userName ?? "",
      action: visible
        ? "storefront.products_published"
        : "storefront.products_unpublished",
      entity: "storefront",
      entityId: ctx.businessId,
      metadata: { cantidad: updated, omitidos: skipped.length },
    });
    revalidateTag(STOREFRONT_CATALOG_TAG);
  }

  return { updated, skipped };
}

/**
 * Da de alta en el catálogo web un producto que aún no tiene ficha.
 *
 * El slug se calcula UNA vez, aquí, con la misma función probada que usó el
 * sembrado, y contra los slugs ya emitidos para que el desempate sea correcto.
 */
export async function createProductWebMeta(
  ctx: RepoContext,
  productId: string,
  productName: string,
): Promise<{ slug: string }> {
  const sb = await getClient("storefront.createProductMeta");
  const usados = await fetchAllPages<{ slug: string }>(async (from, to) => {
    const { data, error } = await sb
      .from("product_web_meta")
      .select("slug")
      .eq("business_id", ctx.businessId)
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });

  const slug = productSlug(
    productName,
    productId,
    new Set(usados.map((u) => u.slug)),
  );
  const { error } = await sb.from("product_web_meta").insert({
    product_id: productId,
    business_id: ctx.businessId,
    slug,
    visible: false,
    updated_by: ctx.userId ?? null,
  });
  if (error) throw error;

  revalidateTag(STOREFRONT_CATALOG_TAG);
  return { slug };
}
