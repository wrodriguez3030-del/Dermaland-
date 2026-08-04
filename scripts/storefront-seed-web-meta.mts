#!/usr/bin/env tsx
/**
 * Sembrado inicial del catálogo web (tienda en línea, E2).
 *
 * Hace tres cosas, todas idempotentes y NINGUNA publica nada:
 *   1. Crea la fila de `business_web_settings` del negocio, con
 *      `storefront_enabled = false`. La tienda nace apagada.
 *   2. Crea una fila de `product_web_meta` por cada producto elegible, con
 *      `visible = false` y su slug ya calculado. Volverlo a correr no duplica ni
 *      reescribe slugs existentes (el slug es ESTABLE por diseño).
 *   3. Marca las sucursales reales como visibles en web y les pone su nombre
 *      comercial.
 *
 * Elegible = activo, vendible, sin borrar, con precio > 0, con foto en el bucket
 * público de Supabase, sin receta y no controlado. Los mismos filtros duros que
 * aplicará el servidor: si algo no es elegible aquí, tampoco se podrá publicar.
 *
 * DRY-RUN por defecto. Uso:
 *   pnpm --filter web exec tsx ../../scripts/storefront-seed-web-meta.ts
 *   pnpm --filter web exec tsx ../../scripts/storefront-seed-web-meta.ts --apply
 *
 * Importa `productSlug` del código de la aplicación a propósito: los slugs que
 * entran a la base deben salir de la MISMA función que está probada, nunca de
 * una copia reimplementada en el script.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productSlug } from "../apps/web/src/features/storefront/slug.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const STORAGE_PREFIX = "/storage/v1/object/public/product-images/";

/** Nombre comercial de cara al público, distinto del nombre interno. */
const NOMBRES_PUBLICOS: Record<string, string> = {
  "00000000-0000-0000-0000-00000000b001": "E. León Jiménez",
  "0a1fd664-ea36-4df0-8634-902eb293a021": "Cutis",
};

// ── Credenciales ────────────────────────────────────────────────────────────
const env: Record<string, string> = {};
for (const linea of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = linea.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_BASE || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${ruta} → HTTP ${res.status}: ${await res.text()}`);
  // Con `Prefer: return=minimal` PostgREST responde 201 y CUERPO VACÍO: parsear
  // a ciegas revienta con "Unexpected end of JSON input" aunque la escritura
  // haya ido bien.
  const texto = await res.text();
  return texto ? (JSON.parse(texto) as T) : (null as T);
}

interface ProductoRow {
  id: string;
  name: string;
  price: number | string | null;
  image_url: string | null;
  active: boolean | null;
  sellable: boolean | null;
  requires_prescription: boolean | null;
  controlled: boolean | null;
}

// ── 1) Leer el catálogo (paginado: PostgREST corta en 1000 en silencio) ──────
const productos: ProductoRow[] = [];
for (let desde = 0; ; desde += 1000) {
  const pagina = await rest<ProductoRow[]>(
    `products?select=id,name,price,image_url,active,sellable,requires_prescription,controlled` +
      `&business_id=eq.${BUSINESS_ID}&deleted_at=is.null&order=name.asc`,
    { headers: { Range: `${desde}-${desde + 999}` } },
  );
  productos.push(...pagina);
  if (pagina.length < 1000) break;
}

const elegibles = productos.filter(
  (p) =>
    p.active !== false &&
    p.sellable !== false &&
    Number(p.price ?? 0) > 0 &&
    (p.image_url ?? "").includes(STORAGE_PREFIX) &&
    p.requires_prescription !== true &&
    p.controlled !== true,
);

// ── 2) Slugs, sin tocar los ya emitidos ─────────────────────────────────────
const existentes = await rest<Array<{ product_id: string; slug: string }>>(
  `product_web_meta?select=product_id,slug&business_id=eq.${BUSINESS_ID}`,
);
const yaTiene = new Set(existentes.map((m) => m.product_id));
const usados = new Set(existentes.map((m) => m.slug));

const nuevos: Array<{ product_id: string; business_id: string; slug: string; visible: boolean }> = [];
for (const p of elegibles) {
  if (yaTiene.has(p.id)) continue;
  const slug = productSlug(p.name, p.id, usados);
  usados.add(slug);
  nuevos.push({ product_id: p.id, business_id: BUSINESS_ID, slug, visible: false });
}

console.log(`productos: ${productos.length} · elegibles: ${elegibles.length}`);
console.log(`  ya tenían metadatos: ${yaTiene.size} · a crear: ${nuevos.length}`);
console.log(`  descartados: ${productos.length - elegibles.length} (sin foto, sin precio, inactivos o restringidos)`);
for (const n of nuevos.slice(0, 5)) console.log(`    ej. ${n.slug}`);

const outDir = path.join(root, "data/storefront");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "seed-web-meta.json"), JSON.stringify(nuevos, null, 2));
console.log(`\nPlan escrito en data/storefront/seed-web-meta.json`);

if (!APPLY) {
  console.log("\nDRY-RUN: nada escrito en la base. Agrega --apply.");
  process.exit(0);
}

// ── 3) Aplicar ───────────────────────────────────────────────────────────────
await rest("business_web_settings?on_conflict=business_id", {
  method: "POST",
  headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  body: JSON.stringify([{ business_id: BUSINESS_ID, storefront_enabled: false, site_name: "DermaLand" }]),
});
console.log("· business_web_settings listo (tienda APAGADA)");

for (let i = 0; i < nuevos.length; i += 200) {
  const lote = nuevos.slice(i, i + 200);
  await rest("product_web_meta", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(lote),
  });
  console.log(`· metadatos ${Math.min(i + 200, nuevos.length)}/${nuevos.length}`);
}

for (const [id, publicName] of Object.entries(NOMBRES_PUBLICOS)) {
  await rest(`branches?id=eq.${id}&business_id=eq.${BUSINESS_ID}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ show_on_website: true, public_name: publicName }),
  });
  console.log(`· sucursal ${publicName}: visible en web`);
}

console.log("\n=== LISTO. Nada está publicado todavía: la tienda sigue apagada. ===");
