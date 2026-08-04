import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { slugify } from "@/features/storefront/slug";
import type {
  PublicBranch,
  StorefrontTenant,
} from "@/features/storefront/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * ¿De qué negocio es la tienda que se está sirviendo?
 *
 * Las rutas públicas no tienen sesión, así que no hay `business_id` en el JWT
 * del que partir. Y en esta base hay DOS negocios con productos (DermaLand y un
 * CNTTEST de pruebas): resolver por "el único negocio que existe" no es frágil
 * a futuro, es ambiguo HOY.
 *
 * El tenant sale de `business_web_settings.storefront_enabled`, que un índice
 * único parcial limita a **como máximo una fila en toda la plataforma**. El
 * resolutor no acepta parámetros a propósito: si el visitante pudiera influir en
 * qué negocio se resuelve —por query string, cabecera o subdominio— tendríamos
 * un salto de tenant servido por nosotros mismos.
 *
 * Fail-closed: devuelve `null` si no hay service-role, si ninguna tienda está
 * encendida o si —contra la garantía de la base— hubiera más de una. `null`
 * significa 404 en las rutas: la tienda apagada no existe, no "está vacía".
 */

/** Columnas de configuración que la tienda necesita. Nunca `select("*")`. */
const SETTINGS_COLUMNS =
  "business_id, site_name, tagline, seo_title, seo_description, og_image_url, whatsapp_phone, contact_email";

/** Columnas de sucursal publicables. `code` solo alimenta el slug de respaldo. */
const BRANCH_COLUMNS =
  "code, name, public_name, address, city, phone, whatsapp";

function limpio(valor: string | null | undefined): string | undefined {
  const texto = valor?.trim();
  return texto ? texto : undefined;
}

/**
 * Sucursales visibles en la tienda, con su nombre COMERCIAL.
 *
 * El sistema las llama "DermaLand Principal" y "Dermaland Cutis"; el negocio las
 * anuncia como "E. León Jiménez" y "Cutis". Se usa `public_name` cuando existe y
 * `name` cuando no, para no tener que renombrar la sucursal —lo que alteraría
 * documentos e informes ya emitidos—.
 *
 * Se excluyen las borradas y las inactivas: la sucursal de pruebas del otro
 * negocio tiene `show_on_website = true` y `deleted_at` puesto, y sin este
 * filtro aparecería en la tienda de alguien.
 */
async function loadPublicBranches(
  sb: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  businessId: string,
): Promise<PublicBranch[]> {
  const { data, error } = await sb
    .from("branches")
    .select(BRANCH_COLUMNS)
    .eq("business_id", businessId)
    .eq("show_on_website", true)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("code", { ascending: true });
  if (error || !data) return [];

  const usados = new Set<string>();
  return data.map((fila) => {
    const nombre = limpio(fila.public_name) ?? fila.name;
    // El código de la sucursal es el respaldo cuando el nombre no deja slug
    // (por ejemplo si fuera solo símbolos), y el desempate ante dos nombres
    // comerciales iguales.
    let slug = slugify(nombre) || slugify(fila.code) || "sucursal";
    if (usados.has(slug))
      slug = `${slug}-${slugify(fila.code) || usados.size + 1}`;
    usados.add(slug);
    return {
      slug,
      name: nombre,
      address: limpio(fila.address),
      city: limpio(fila.city),
      phone: limpio(fila.phone),
      whatsapp: limpio(fila.whatsapp),
    };
  });
}

/**
 * Etiqueta de caché del tenant. Encender o apagar la tienda, o cambiar el
 * nombre público de una sucursal, debe llamar a `revalidateTag`: si no, el
 * cambio tardaría hasta `SEGUNDOS_DE_CACHE` en verse.
 */
export const STOREFRONT_TENANT_TAG = "storefront-tenant";

/** La configuración cambia muy de vez en cuando; el catálogo, a diario. */
const SEGUNDOS_DE_CACHE = 300;

/**
 * Negocio dueño de la tienda encendida, o `null`.
 *
 * Caché en dos niveles, por el mismo motivo que el catálogo: `cache()` de React
 * evita repetir la consulta dentro de una petición (layout, página y metadatos
 * lo piden por separado) y `unstable_cache` la conserva entre peticiones, para
 * que la cabecera y el pie no cuesten dos viajes a la base en cada visita.
 */
export const resolveStorefrontTenant = cache(
  async (): Promise<StorefrontTenant | null> =>
    unstable_cache(leerTenant, ["storefront-tenant"], {
      revalidate: SEGUNDOS_DE_CACHE,
      tags: [STOREFRONT_TENANT_TAG],
    })(),
);

const leerTenant = async (): Promise<StorefrontTenant | null> => {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  // `limit(2)` para poder DISTINGUIR "una" de "más de una" y cerrarse en el
  // segundo caso, en vez de servir la primera que devuelva la base.
  const { data, error } = await sb
    .from("business_web_settings")
    .select(SETTINGS_COLUMNS)
    .eq("storefront_enabled", true)
    .limit(2);
  if (error || !data || data.length !== 1) return null;

  const ajustes = data[0]!;
  const branches = await loadPublicBranches(sb, ajustes.business_id);

  return {
    businessId: ajustes.business_id,
    siteName: limpio(ajustes.site_name) ?? "DermaLand",
    tagline: limpio(ajustes.tagline),
    seoTitle: limpio(ajustes.seo_title),
    seoDescription: limpio(ajustes.seo_description),
    ogImageUrl: limpio(ajustes.og_image_url),
    whatsappPhone: limpio(ajustes.whatsapp_phone),
    contactEmail: limpio(ajustes.contact_email),
    branches,
  };
};

/** URL absoluta de la tienda, para enlaces canónicos y datos estructurados. */
export function storefrontBaseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}
