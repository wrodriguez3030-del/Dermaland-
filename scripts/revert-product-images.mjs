#!/usr/bin/env node
/**
 * Revierte fotos de producto mal asignadas: pone `products.image_url` a NULL y
 * borra el objeto del bucket `product-images`.
 *
 * REGLAS DE SEGURIDAD:
 *  - Solo revierte si `image_url` apunta a NUESTRO bucket. Una foto puesta a mano
 *    por un usuario (o una URL externa) no se toca: la guarda va en el propio
 *    PATCH (`image_url=like.*product-images*`), así decide Postgres.
 *  - DRY-RUN por defecto; `--apply` escribe.
 *  - Deja `reverted.json` con lo que se revirtió, por si hay que rehacerlo.
 *
 * Uso:
 *   node scripts/revert-product-images.mjs <skus.json> [--apply]
 *   donde <skus.json> es ["DERM-I00029", ...] o [{"sku":"...","razon":"..."}, ...]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LISTA = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!LISTA) {
  console.error("Uso: node scripts/revert-product-images.mjs <skus.json> [--apply]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BUCKET = "product-images";

const entrada = JSON.parse(readFileSync(LISTA, "utf8"));
const items = entrada.map((e) => (typeof e === "string" ? { sku: e, razon: "" } : { sku: e.sku, razon: e.razon ?? e.loQueDiceElEnvase ?? "" }));

const skus = [...new Set(items.map((i) => i.sku))];
const res = await fetch(
  `${URL_}/rest/v1/products?deleted_at=is.null&sku=in.(${skus.map((s) => `"${s}"`).join(",")})&select=id,business_id,sku,name,image_url`,
  { headers },
);
if (!res.ok) { console.error(`GET products: ${res.status} ${await res.text()}`); process.exit(1); }
const rows = await res.json();

const plan = [], omitidos = [];
for (const it of items) {
  const p = rows.find((r) => r.sku === it.sku);
  if (!p) { omitidos.push({ ...it, motivo: "sku_no_encontrado" }); continue; }
  if (!p.image_url) { omitidos.push({ ...it, motivo: "ya_estaba_sin_foto" }); continue; }
  if (!p.image_url.includes(`/${BUCKET}/`)) { omitidos.push({ ...it, motivo: "foto_ajena_no_se_toca", url: p.image_url }); continue; }
  plan.push({ id: p.id, sku: p.sku, name: p.name, image_url: p.image_url, razon: it.razon,
    storagePath: `businesses/${p.business_id}/products/${p.id}/image.webp` });
}

console.log(JSON.stringify({ pedidos: items.length, aRevertir: plan.length, omitidos: omitidos.length }, null, 2));
for (const o of omitidos) console.log(`  omitido ${o.sku}: ${o.motivo}`);
for (const p of plan) console.log(`  revertir ${p.sku} — ${p.name}${p.razon ? `\n      motivo: ${p.razon}` : ""}`);

if (!APPLY) { console.log(`\nDRY-RUN: no se escribió nada. Reejecuta con --apply para revertir ${plan.length}.`); process.exit(0); }

let ok = 0, err = 0;
const revertidos = [];
for (const p of plan) {
  const patch = await fetch(
    `${URL_}/rest/v1/products?id=eq.${p.id}&image_url=like.*${BUCKET}*&deleted_at=is.null`,
    { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ image_url: null }) },
  );
  if (!patch.ok) { err++; continue; }
  const changed = await patch.json();
  if (changed.length !== 1) { err++; continue; }
  // el objeto del bucket se borra después: si esto falla, la ficha ya quedó limpia
  await fetch(`${URL_}/storage/v1/object/${BUCKET}/${p.storagePath}`, {
    method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).catch(() => {});
  ok++;
  revertidos.push({ sku: p.sku, name: p.name, image_url_anterior: p.image_url, razon: p.razon });
}

const stamp = new Date().toISOString().slice(0, 10);
const outDir = path.join(root, `data/product-images-${stamp}-revertidos`);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "reverted.json"), JSON.stringify(revertidos, null, 2));
console.log(`\n=== REVERTIDO: ok=${ok} err=${err}. Detalle: ${outDir}/reverted.json ===`);
