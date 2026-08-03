#!/usr/bin/env node
/**
 * Carga imágenes de producto (WebP optimizado) al bucket `product-images` de
 * Supabase Storage y rellena `products.image_url`, emparejando por NOMBRE
 * normalizado contra el catálogo público de Farmacia Carol.
 *
 * REGLAS DE SEGURIDAD (no negociables):
 *  - Solo UPDATE de productos EXISTENTES cuyo `image_url` está NULL. Nunca crea
 *    productos ni sobrescribe una imagen ya asignada (guarda `image_url=is.null`
 *    en el propio PATCH, así la carrera la resuelve Postgres, no el script).
 *  - Solo aplica matches de ALTA CONFIANZA:
 *      · nombre exacto tras normalizar, o
 *      · similitud de tokens >= 0.88 CON la misma medida (237ML, 50G, SPF50…).
 *    Un nombre que empareja 2+ productos, o 2 imágenes que empatan al mismo
 *    producto, se descartan a revisión manual.
 *  - Sube al path que ya usa `product-image-service.ts`:
 *      businesses/{business_id}/products/{product_id}/image.webp
 *  - DRY-RUN por defecto. Escribe `image-affected.json` para revertir.
 *
 * Uso:
 *   node scripts/import-product-images-from-carol.mjs "<manifiesto.json>"           # DRY-RUN
 *   node scripts/import-product-images-from-carol.mjs "<manifiesto.json>" --apply   # aplica
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY de apps/web/.env.local. NUNCA imprime claves.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = process.argv[2];
const APPLY = process.argv.includes("--apply");
const APPROVED_MODE = process.argv.includes("--approved");
if (!MANIFEST) {
  console.error('Uso: node scripts/import-product-images-from-carol.mjs "<manifiesto.json>" [--apply]');
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
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BUCKET = "product-images";

// ── normalización (misma convención que import-barcodes-from-alegra.mjs) ──
const UNITS = "ML|MG|GR|G|KG|L|CC|OZ|UI|CAPS|CAP|TABLETAS|TABLETA|TABS|TAB|COMP|SOBRES|SOBRE|UND|UD|EN";
function norm(raw) {
  let s = String(raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  s = s.replace(/[^A-Z0-9+%.\s]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), "$1$2").replace(/SPF\s+(\d)/g, "SPF$1");
  return s.replace(/\s+/g, " ").trim();
}
/** Tokens con medida: 237ML, 50G, SPF50… Son la firma del producto. */
function sizeTokens(n) {
  return new Set(
    (n.match(new RegExp(`\\b\\d+(?:\\.\\d+)?(?:${UNITS})\\b|\\bSPF\\d+\\b`, "g")) ?? []).map(String),
  );
}
const eqSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
function jaccard(a, b) {
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// ── manifiesto de imágenes ──
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const imagesDir = path.join(path.dirname(path.resolve(MANIFEST)), "imagenes");
const images = (manifest.images ?? []).filter((i) => i.file && i.name);
const totalImages = images.length;
// Fotos idénticas compartidas por varios productos = placeholder "sin foto": no se suben.
const placeholderHashes = new Set(
  (manifest.duplicates ?? []).filter((d) => d.count >= 3).map((d) => d.sha1),
);

// ── traer productos activos (paginado: PostgREST corta en 1000) ──
async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${URL_}/rest/v1/products?deleted_at=is.null&select=id,business_id,sku,name,barcode,image_url`,
      { headers: { ...headers, Range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`GET products: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const products = await fetchAll();
const candidates = products.filter((p) => !p.image_url); // solo los que NO tienen foto
const byNorm = new Map();
for (const p of candidates) {
  const k = norm(p.name);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(p);
}

// ── emparejar ──
const plan = [], review = [], noMatch = [], suggestions = [];
const assigned = new Map();

// Modo `--approved <archivo.json>`: aplica una lista ya revisada a mano
// ([{file, sku}, ...]) en vez de emparejar por nombre. Las mismas guardas
// siguen vigentes: solo productos sin foto, un sku por foto y una foto por sku.
if (APPROVED_MODE) {
  const approvedArg = process.argv.indexOf("--approved");
  const approved = JSON.parse(readFileSync(process.argv[approvedArg + 1], "utf8"));
  const bySku = new Map(candidates.map((p) => [p.sku, p]));
  const imgByFile = new Map(images.map((i) => [i.file, i]));
  const usedFile = new Set();
  for (const a of approved) {
    const p = bySku.get(a.sku);
    if (!p) { review.push({ file: a.file, sku: a.sku, reason: "sku_inexistente_o_ya_tiene_foto" }); continue; }
    if (!imgByFile.has(a.file)) { review.push({ file: a.file, sku: a.sku, reason: "archivo_no_esta_en_manifiesto" }); continue; }
    if (assigned.has(p.id)) { review.push({ file: a.file, sku: a.sku, reason: "sku_repetido_en_aprobados" }); continue; }
    if (usedFile.has(a.file)) { review.push({ file: a.file, sku: a.sku, reason: "archivo_repetido_en_aprobados" }); continue; }
    assigned.set(p.id, a);
    usedFile.add(a.file);
    plan.push({
      id: p.id, businessId: p.business_id, sku: p.sku, dbName: p.name,
      carolName: a.carolName ?? "", file: a.file, match: `aprobado:${a.confianza ?? "manual"}`,
      storagePath: `businesses/${p.business_id}/products/${p.id}/image.webp`,
    });
  }
  images.length = 0; // salta el emparejamiento automático de abajo
}

for (const img of images) {
  if (placeholderHashes.has(img.sha1)) { review.push({ file: img.file, name: img.name, reason: "placeholder_sin_foto" }); continue; }
  const key = norm(img.name);
  const imgSizes = sizeTokens(key);

  let cands = byNorm.get(key) ?? [];
  let how = "exacto";
  if (cands.length === 0) {
    // fuzzy: misma medida + similitud alta, y que el mejor gane por margen claro
    const scored = candidates
      .map((p) => ({ p, s: jaccard(key, norm(p.name)) }))
      .filter((x) => x.s >= 0.88 && eqSet(imgSizes, sizeTokens(norm(x.p.name))))
      .sort((a, b) => b.s - a.s);
    if (scored.length === 0) {
      // Casi-aciertos: no se aplican solos, pero se listan para aprobación manual.
      const near = candidates
        .map((p) => ({ p, s: jaccard(key, norm(p.name)) }))
        .filter((x) => x.s >= 0.5)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3);
      noMatch.push({ file: img.file, name: img.name });
      for (const n of near) {
        suggestions.push({ file: img.file, carolName: img.name, sku: n.p.sku, dbName: n.p.name, score: Number(n.s.toFixed(2)) });
      }
      continue;
    }
    if (scored.length > 1 && scored[1].s === scored[0].s) {
      review.push({ file: img.file, name: img.name, reason: "empate_fuzzy", dbNames: scored.slice(0, 3).map((x) => x.p.name) });
      continue;
    }
    cands = [scored[0].p];
    how = `fuzzy(${scored[0].s.toFixed(2)})`;
  }
  if (cands.length > 1) {
    review.push({ file: img.file, name: img.name, reason: "multiple_productos", dbNames: cands.map((c) => c.name) });
    continue;
  }
  const p = cands[0];
  if (assigned.has(p.id)) {
    review.push({ file: img.file, name: img.name, reason: "producto_asignado_por_2_imagenes", dbName: p.name });
    continue;
  }
  assigned.set(p.id, img);
  plan.push({
    id: p.id, businessId: p.business_id, sku: p.sku, dbName: p.name,
    carolName: img.name, file: img.file, match: how,
    storagePath: `businesses/${p.business_id}/products/${p.id}/image.webp`,
  });
}

// ── salida ──
const stamp = new Date().toISOString().slice(0, 10);
// Cada modo escribe en su propia carpeta: si compartieran una, un dry-run
// posterior pisaría el plan y las sugerencias de la corrida anterior (y en
// modo aprobados, el CSV de sugerencias que aún está por revisar).
const outDir = path.join(root, `data/product-images-${stamp}${APPROVED_MODE ? "-aprobados" : ""}`);
mkdirSync(outDir, { recursive: true });
const summary = {
  fecha: stamp, aplicado: APPLY,
  imagenesManifiesto: totalImages,
  productosActivos: products.length,
  productosSinImagen: candidates.length,
  planAsignaciones: plan.length,
  exactos: plan.filter((x) => x.match === "exacto").length,
  fuzzy: plan.filter((x) => x.match !== "exacto").length,
  paraRevisar: review.length,
  sinMatch: noMatch.length,
  sugerenciasParaAprobar: suggestions.length,
};
writeFileSync(path.join(outDir, "image-plan.json"), JSON.stringify(plan, null, 2));
writeFileSync(path.join(outDir, "image-review.json"), JSON.stringify({ review, noMatch }, null, 2));
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
writeFileSync(
  path.join(outDir, "sugerencias-revisar.csv"),
  "﻿" + ["archivo", "nombre_carol", "sku_dermaland", "nombre_dermaland", "similitud"].join(",") + "\n" +
    suggestions
      .sort((a, b) => b.score - a.score)
      .map((s) => [s.file, s.carolName, s.sku, s.dbName, s.score].map(csvCell).join(","))
      .join("\n"),
  "utf8",
);
writeFileSync(path.join(outDir, "image-summary.json"), JSON.stringify(summary, null, 2));
console.log("=== RESUMEN ===\n" + JSON.stringify(summary, null, 2));

if (!APPLY) {
  console.log(`\nDRY-RUN: no se escribió nada. Revisa ${outDir}. Reejecuta con --apply para aplicar ${plan.length} imágenes.`);
  process.exit(0);
}

// ── aplicar: subir a Storage y PATCH con guarda image_url=is.null ──
let ok = 0, skip = 0, err = 0;
const affected = [];
const errors = [];
const chunk = 8;
for (let i = 0; i < plan.length; i += chunk) {
  const batch = plan.slice(i, i + chunk);
  await Promise.all(batch.map(async (a) => {
    try {
      const body = readFileSync(path.join(imagesDir, a.file));
      const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${a.storagePath}`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/webp", "x-upsert": "true" },
        body,
      });
      if (!up.ok) { err++; errors.push({ file: a.file, step: "upload", status: up.status, detail: (await up.text()).slice(0, 200) }); return; }

      const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${a.storagePath}`;
      const res = await fetch(
        `${URL_}/rest/v1/products?id=eq.${a.id}&image_url=is.null&deleted_at=is.null`,
        { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ image_url: publicUrl }) },
      );
      if (!res.ok) { err++; errors.push({ file: a.file, step: "patch", status: res.status, detail: (await res.text()).slice(0, 200) }); return; }
      const rows = await res.json();
      if (rows.length === 1) { ok++; affected.push({ id: a.id, sku: a.sku, dbName: a.dbName, image_url: publicUrl, storagePath: a.storagePath }); }
      else skip++;
    } catch (e) {
      err++; errors.push({ file: a.file, step: "excepcion", detail: String(e.message || e) });
    }
  }));
  process.stdout.write(`\r  ${Math.min(i + chunk, plan.length)}/${plan.length} (ok=${ok} skip=${skip} err=${err})`);
}
console.log("");
writeFileSync(path.join(outDir, "image-affected.json"), JSON.stringify(affected, null, 2));
if (errors.length) writeFileSync(path.join(outDir, "image-errors.json"), JSON.stringify(errors, null, 2));
console.log(`=== APLICADO: ok=${ok} skip=${skip} err=${err}. Reversible: ${outDir}/image-affected.json ===`);
