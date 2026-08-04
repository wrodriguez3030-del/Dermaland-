import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { revalidateTag } from "next/cache";
import { DR_PROVINCES } from "@/features/storefront/shipping/provinces";
import type { ShippingRate } from "@/features/storefront/shipping/quote";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Tarifas de envío: a qué provincias se llega y por cuánto.
 *
 * La tabla nace vacía y **sin fila no se envía**. Sembrarla con las 32
 * provincias a coste 0 habría hecho que un olvido en el panel se tradujera en
 * envíos gratis a la otra punta del país.
 */

/** Etiqueta de caché. Guardar tarifas la invalida, o el cambio tarda 5 minutos. */
export const SHIPPING_RATES_TAG = "storefront-shipping-rates";

const SEGUNDOS_DE_CACHE = 300;

const leerTarifas = async (businessId: string): Promise<ShippingRate[]> => {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("shipping_rates")
    .select("province_slug, cost, active")
    .eq("business_id", businessId);
  if (error || !data) return [];
  return data.map((r) => ({
    provinceSlug: r.province_slug,
    cost: Number(r.cost),
    active: r.active,
  }));
};

/**
 * Tarifas vigentes. Cacheadas en dos niveles como el catálogo: el checkout las
 * pide, la portada no, y no tiene sentido un viaje a la base por cada visita.
 */
export const loadShippingRates = cache(
  async (businessId: string): Promise<ShippingRate[]> =>
    unstable_cache(
      () => leerTarifas(businessId),
      ["storefront-shipping-rates", businessId],
      { revalidate: SEGUNDOS_DE_CACHE, tags: [SHIPPING_RATES_TAG] },
    )(),
);

/** ¿Se puede pedir a domicilio? Si no hay ninguna provincia activa, no. */
export async function deliveryAvailable(businessId: string): Promise<boolean> {
  const tarifas = await loadShippingRates(businessId);
  return tarifas.some((t) => t.active && t.cost >= 0);
}

export interface ShippingRateRow {
  provinceSlug: string;
  provinceName: string;
  cost: number;
  active: boolean;
}

/**
 * Las 32 provincias con su tarifa, para el panel.
 *
 * Se parte SIEMPRE de la lista de código y se le pega encima lo que haya en la
 * base: así el panel enseña las 32 aunque la tabla esté vacía, y una provincia
 * que alguien borrara de la tabla vuelve a aparecer desactivada en vez de
 * desaparecer del panel.
 */
export async function listShippingRatesForAdmin(
  businessId: string,
): Promise<ShippingRateRow[]> {
  const guardadas = new Map(
    (await leerTarifas(businessId)).map((t) => [t.provinceSlug, t]),
  );
  return DR_PROVINCES.map((p) => {
    const t = guardadas.get(p.slug);
    return {
      provinceSlug: p.slug,
      provinceName: p.name,
      cost: t?.cost ?? 0,
      active: t?.active ?? false,
    };
  });
}

export interface SaveShippingRateInput {
  provinceSlug: string;
  cost: number;
  active: boolean;
}

/**
 * Guarda las tarifas. Sobrescribe solo las provincias que llegan.
 *
 * Valida contra la lista de código: un `province_slug` inventado no entra, por
 * mucho que llegue en el cuerpo de la petición.
 */
export async function saveShippingRates(
  businessId: string,
  userId: string | undefined,
  filas: SaveShippingRateInput[],
): Promise<{ ok: boolean; error?: string; saved?: number }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const validos = new Set(DR_PROVINCES.map((p) => p.slug));
  const limpias = filas.filter(
    (f) =>
      validos.has(f.provinceSlug) &&
      Number.isFinite(f.cost) &&
      f.cost >= 0,
  );
  if (limpias.length === 0) return { ok: false, error: "Nada que guardar." };

  const { error } = await admin.from("shipping_rates").upsert(
    limpias.map((f) => ({
      business_id: businessId,
      province_slug: f.provinceSlug,
      cost: f.cost,
      active: f.active,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    })),
    { onConflict: "business_id,province_slug" },
  );
  if (error) return { ok: false, error: "No se pudieron guardar las tarifas." };

  // Sin esto el cambio tardaría hasta cinco minutos en verse en la tienda, y
  // quien lo guardó creería que no funcionó.
  revalidateTag(SHIPPING_RATES_TAG);
  return { ok: true, saved: limpias.length };
}
