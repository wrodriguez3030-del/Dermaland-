#!/usr/bin/env node
/**
 * Descarga fotos de producto desde una lista de URLs, las optimiza a WebP y deja
 * el paquete listo para `import-product-images-from-carol.mjs --approved`.
 *
 * Entrada: uno o más JSON con [{sku, name, imageUrl, source?, confianza?}, ...]
 * Salida en <outDir>:
 *   imagenes/<sku>.webp
 *   manifiesto.json   (lo que espera el importador)
 *   aprobados.json    ([{file, sku, carolName, confianza}])
 *   descartes.json    (por qué se cayó cada una)
 *
 * Uso:
 *   node scripts/fetch-product-images.mjs <outDir> <fotos-a.json> [fotos-b.json ...]
 *
 * No escribe en la base de datos ni en Storage: eso lo hace el importador, que
 * es quien tiene las guardas. Aquí solo se descarga y se comprime.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// sharp no es dependencia de la app (Next lo trae aparte); se toma del paquete
// de trabajo donde se instaló para esta tarea.
const SHARP_DIR = "/private/tmp/claude-501/-Users-willianrodriguez/d4fe9647-e1b0-4437-ba36-1d545b09f35a/scratchpad/optimize";
const require = createRequire(path.join(SHARP_DIR, "package.json"));
const sharp = require("sharp");

const [, , outDir, ...inputs] = process.argv;
if (!outDir || inputs.length === 0) {
  console.error("Uso: node scripts/fetch-product-images.mjs <outDir> <fotos-a.json> [fotos-b.json ...]");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_EDGE = 800;
const MIN_SOURCE_BYTES = 4 * 1024; // por debajo de esto suele ser un icono o un 1x1
const MIN_EDGE = 200; // una foto de catálogo más pequeña no sirve
const CONCURRENCY = 6;

// ── juntar entradas, primer sku gana ──
const bySku = new Map();
const dupes = [];
for (const file of inputs) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`  aviso: no se pudo leer ${file}: ${e.message}`);
    continue;
  }
  for (const r of rows) {
    if (!r?.sku || !r?.imageUrl) continue;
    if (bySku.has(r.sku)) { dupes.push({ sku: r.sku, descartada: r.imageUrl, origen: file }); continue; }
    bySku.set(r.sku, { ...r, origenArchivo: path.basename(file) });
  }
}
const queue = [...bySku.values()];
console.log(`${queue.length} productos con URL (${dupes.length} duplicados por sku descartados)`);

const IMG_DIR = path.join(outDir, "imagenes");
mkdirSync(IMG_DIR, { recursive: true });

async function fetchImage(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/*,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_SOURCE_BYTES) throw new Error(`demasiado pequeña (${buf.length} B)`);
      return buf;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

const rows = [];
const approved = [];
const descartes = [...dupes.map((d) => ({ ...d, motivo: "sku_duplicado_entre_agentes" }))];
const byHash = new Map();
let done = 0;

async function worker() {
  while (queue.length) {
    const p = queue.shift();
    try {
      const raw = await fetchImage(p.imageUrl);
      const meta = await sharp(raw, { failOn: "none" }).metadata();
      if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < MIN_EDGE) {
        throw new Error(`resolución insuficiente (${meta.width}x${meta.height})`);
      }
      const file = `${p.sku}.webp`;
      const { data, info } = await sharp(raw, { failOn: "none" })
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // PNG con transparencia → fondo blanco
        .webp({ quality: 82, effort: 6, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      writeFileSync(path.join(IMG_DIR, file), data);

      const hash = createHash("sha1").update(data).digest("hex");
      byHash.set(hash, [...(byHash.get(hash) ?? []), p.sku]);

      rows.push({
        productId: p.sku, code: p.sku, name: p.name, file,
        width: info.width, height: info.height,
        originalBytes: raw.length, webpBytes: data.length,
        sourceUrl: p.imageUrl, detailUrl: p.source ?? "", sha1: hash,
      });
      approved.push({ file, sku: p.sku, carolName: p.name, confianza: p.confianza ?? "media" });
    } catch (err) {
      descartes.push({ sku: p.sku, name: p.name, url: p.imageUrl, motivo: String(err.message || err) });
    }
    if (++done % 25 === 0) console.log(`  ${done} procesadas...`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Varias fichas con la misma foto suele ser un placeholder genérico del sitio.
const duplicates = [...byHash.entries()]
  .filter(([, skus]) => skus.length > 1)
  .map(([sha1, skus]) => ({ sha1, count: skus.length, skus }))
  .sort((a, b) => b.count - a.count);

writeFileSync(
  path.join(outDir, "manifiesto.json"),
  JSON.stringify({ generatedFrom: inputs.map((i) => path.basename(i)), images: rows, skipped: descartes, duplicates }, null, 2),
);
writeFileSync(path.join(outDir, "aprobados.json"), JSON.stringify(approved, null, 2));
writeFileSync(path.join(outDir, "descartes.json"), JSON.stringify(descartes, null, 2));

const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(
  JSON.stringify(
    {
      ok: rows.length,
      descartadas: descartes.length,
      originalMB: mb(sum("originalBytes")),
      webpMB: mb(sum("webpBytes")),
      reduccionPct: sum("originalBytes") ? (((sum("originalBytes") - sum("webpBytes")) / sum("originalBytes")) * 100).toFixed(1) : "0",
      gruposFotoRepetida: duplicates.length,
      mayorGrupoRepetido: duplicates[0]?.count ?? 0,
    },
    null,
    2,
  ),
);
