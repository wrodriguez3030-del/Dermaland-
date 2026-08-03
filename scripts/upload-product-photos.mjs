#!/usr/bin/env node
/**
 * Carga MASIVA de fotos de producto a Supabase Storage.
 *
 * Lee una carpeta con imágenes y las empareja con los productos de DermaLand.
 * El nombre de cada archivo dice a qué producto pertenece; se acepta cualquiera
 * de estas tres formas (se prueban en este orden):
 *
 *   1. CÓDIGO DE BARRAS   → `8470001977793.jpg`
 *   2. SKU                → `DERM-00123.jpg`
 *   3. NOMBRE del producto→ `Isdin Fusion Water Magic SPF 50.jpg`
 *
 * Es lo más cómodo en la práctica: si fotografías con el lector de barras a
 * mano, nombras por código; si no, por nombre y el emparejamiento normaliza
 * acentos, mayúsculas y unidades igual que el resto de importadores.
 *
 * REGLAS DE SEGURIDAD:
 *  - DRY-RUN por defecto. Sin `--apply` no sube nada ni toca la base.
 *  - NO crea productos ni cambia precio, costo o stock: solo `image_url`.
 *  - NO pisa una foto existente salvo que pases `--overwrite`.
 *  - Valida tipo real por MAGIC BYTES, no por la extensión del archivo.
 *  - Tope de 3 MB por archivo (el mismo del bucket).
 *  - `business_id` es constante del código.
 *
 * Uso:
 *   node scripts/upload-product-photos.mjs "<carpeta>"
 *   node scripts/upload-product-photos.mjs "<carpeta>" --apply
 *   node scripts/upload-product-photos.mjs "<carpeta>" --apply --overwrite
 *
 * Salida: consola + data/photo-upload-<stamp>/*.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const BUCKET = "product-images";
const MAX_BYTES = 3 * 1024 * 1024;

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
const OVERWRITE = args.includes("--overwrite");
if (!DIR) {
  console.error('Uso: node scripts/upload-product-photos.mjs "<carpeta>" [--apply] [--overwrite]');
  process.exit(1);
}

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const UNITS = "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";
function norm(raw) {
  let s = String(raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2").replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
}

/** Tipo real del archivo por sus primeros bytes; ignora la extensión. */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (buf.length > 12 && buf.subarray(4, 12).toString() === "ftypavif") return "image/avif";
  return null;
}
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

async function fetchAllPages(q) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${q}&order=id&offset=${off}&limit=1000`, { headers: H });
    if (!r.ok) throw new Error(`GET ${q} → ${r.status}`);
    const b = await r.json();
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
console.log(APPLY ? "\n⚠️  MODO APLICAR — se van a subir fotos\n" : "\n🔍 SIMULACIÓN (dry-run) — no se sube nada\n");

const products = await fetchAllPages(
  `products?select=id,sku,name,barcode,image_url&business_id=eq.${BUSINESS_ID}&deleted_at=is.null`,
);
const byBc = new Map();
const bySku = new Map();
const byName = new Map();
for (const p of products) {
  if (p.barcode) byBc.set(String(p.barcode).trim(), p);
  if (p.sku) bySku.set(String(p.sku).trim().toUpperCase(), p);
  const k = norm(p.name);
  (byName.get(k) ?? byName.set(k, []).get(k)).push(p);
}
console.log(`Productos en la base: ${products.length}`);

const archivos = readdirSync(DIR).filter((f) => {
  const full = path.join(DIR, f);
  return statSync(full).isFile() && !f.startsWith(".");
});
console.log(`Archivos en la carpeta: ${archivos.length}\n`);

const plan = [];
const problemas = { sinMatch: [], noEsImagen: [], muyGrande: [], yaTieneFoto: [], ambiguo: [], duplicado: [] };
const usados = new Map();

for (const file of archivos) {
  const full = path.join(DIR, file);
  const size = statSync(full).size;
  const base = path.parse(file).name.trim();

  let p = byBc.get(base.replace(/\D/g, "")) ?? bySku.get(base.toUpperCase());
  let via = p ? (byBc.has(base.replace(/\D/g, "")) ? "código de barras" : "SKU") : null;
  if (!p) {
    const hits = byName.get(norm(base)) ?? [];
    if (hits.length === 1) {
      p = hits[0];
      via = "nombre";
    } else if (hits.length > 1) {
      problemas.ambiguo.push({ file, candidatos: hits.map((h) => h.name) });
      continue;
    }
  }
  if (!p) {
    problemas.sinMatch.push(file);
    continue;
  }
  if (usados.has(p.id)) {
    problemas.duplicado.push({ file, otro: usados.get(p.id), producto: p.name });
    continue;
  }
  if (size > MAX_BYTES) {
    problemas.muyGrande.push({ file, mb: (size / 1048576).toFixed(2) });
    continue;
  }
  const buf = readFileSync(full);
  const mime = sniff(buf);
  if (!mime) {
    problemas.noEsImagen.push(file);
    continue;
  }
  if (p.image_url && !OVERWRITE) {
    problemas.yaTieneFoto.push({ file, producto: p.name });
    continue;
  }
  usados.set(p.id, file);
  plan.push({ file, full, mime, size, product: p, via });
}

console.log("═══ PLAN DE CARGA DE FOTOS ═══");
console.log(`  fotos a subir            : ${plan.length}`);
console.log(`    · por código de barras : ${plan.filter((x) => x.via === "código de barras").length}`);
console.log(`    · por SKU              : ${plan.filter((x) => x.via === "SKU").length}`);
console.log(`    · por nombre           : ${plan.filter((x) => x.via === "nombre").length}`);
console.log("  ─────────────────────────────");
console.log(`  sin producto que empareje: ${problemas.sinMatch.length}`);
console.log(`  nombre ambiguo           : ${problemas.ambiguo.length}`);
console.log(`  dos archivos, un producto: ${problemas.duplicado.length}`);
console.log(`  no son imagen válida     : ${problemas.noEsImagen.length}`);
console.log(`  pasan de 3 MB            : ${problemas.muyGrande.length}`);
console.log(`  el producto ya tiene foto: ${problemas.yaTieneFoto.length}${OVERWRITE ? " (se van a pisar)" : " (se omiten; usa --overwrite)"}`);

if (problemas.sinMatch.length) {
  console.log("\n=== SIN EMPAREJAR (primeros 15) ===");
  problemas.sinMatch.slice(0, 15).forEach((f) => console.log("   ", f));
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
const outDir = path.join(root, "data", `photo-upload-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "plan.json"),
  JSON.stringify(plan.map((x) => ({ file: x.file, producto: x.product.name, via: x.via })), null, 1),
);
writeFileSync(path.join(outDir, "problemas.json"), JSON.stringify(problemas, null, 1));
console.log(`\n  detalle → data/photo-upload-${stamp}/`);

if (!APPLY) {
  console.log("\n🔍 Simulación terminada. Nada se subió. Agrega --apply para ejecutar.\n");
  process.exit(0);
}

console.log("\n⏳ Subiendo…");
let ok = 0;
let fail = 0;
for (const x of plan) {
  try {
    const key = `${BUSINESS_ID}/${x.product.id}.${EXT[x.mime]}`;
    const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: { ...H, "Content-Type": x.mime, "x-upsert": "true", "Cache-Control": "public, max-age=31536000" },
      body: readFileSync(x.full),
    });
    if (!up.ok) throw new Error(`storage ${up.status} ${await up.text()}`);

    const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${key}`;
    const patch = await fetch(`${URL_}/rest/v1/products?id=eq.${x.product.id}`, {
      method: "PATCH",
      headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ image_url: publicUrl, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`products ${patch.status} ${await patch.text()}`);
    ok++;
  } catch (e) {
    fail++;
    console.error(`  ❌ ${x.file} (${x.product.name}): ${e.message}`);
  }
}
console.log(`\n✅ Listo: ${ok} fotos subidas · ${fail} fallos\n`);
