#!/usr/bin/env node
// Asigna un SKU secuencial (DERM-000001…) a productos SIN SKU (nulo o vacío).
// NO toca productos que ya tienen SKU. No borra nada. Idempotente.
// Nota: en el esquema actual `products.sku` es NOT NULL, así que normalmente no
// hay pendientes; el script existe por si se importan productos sin SKU.
//
// Uso:  node scripts/backfill-product-skus.mjs [--apply]
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
const cfg = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
const URL_ = cfg("NEXT_PUBLIC_SUPABASE_URL");
const KEY = cfg("SUPABASE_SERVICE_ROLE_KEY");
const APPLY = process.argv.includes("--apply");
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const parse = (sku) => {
  const m = /^DERM-(\d+)$/i.exec((sku ?? "").trim());
  return m ? parseInt(m[1], 10) : null;
};
const fmt = (n) => `DERM-${String(n).padStart(6, "0")}`;

async function all(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { ...h, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function main() {
  const products = await all("products?select=id,sku,business_id&deleted_at=is.null");
  const maxByBiz = new Map();
  for (const p of products) {
    const n = parse(p.sku);
    if (n != null) maxByBiz.set(p.business_id, Math.max(maxByBiz.get(p.business_id) ?? 0, n));
  }
  const pending = products.filter((p) => !p.sku || !String(p.sku).trim());
  let assigned = 0;
  for (const p of pending) {
    const next = (maxByBiz.get(p.business_id) ?? 0) + 1;
    maxByBiz.set(p.business_id, next);
    if (APPLY) {
      const res = await fetch(`${URL_}/rest/v1/products?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ sku: fmt(next) }),
      });
      if (res.ok) assigned++;
    } else assigned++;
  }
  console.log(`Productos revisados: ${products.length}`);
  console.log(`Ya tenían SKU: ${products.length - pending.length}`);
  console.log(`${APPLY ? "Asignados" : "Asignables (dry run)"}: ${assigned}`);
  console.log(`Duplicados evitados: 0 (solo se tocan productos con SKU vacío)`);
  if (!APPLY && pending.length) console.log("\n(Ejecuta con --apply para escribir.)");
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
