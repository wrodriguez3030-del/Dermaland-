#!/usr/bin/env node
// Backfill idempotente: asigna laboratory_id a productos que NO lo tienen,
// según el nombre/marca del producto y una tabla de alias. NUNCA sobreescribe
// un laboratorio ya asignado. No borra nada. No toca otros negocios (filtra por
// business_id de cada producto contra sus laboratorios del mismo negocio).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-product-laboratories.mjs [--apply]
//
// Sin --apply hace un "dry run" (solo imprime el resumen). Con --apply escribe.
// Genera reports/product-laboratory-backfill-pending.csv con los pendientes.
//
// Nota: el service_role NO debe compartirse. Este script no imprime secretos.

import { writeFileSync, mkdirSync } from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!URL || !KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const LAB_ALIASES = [
  { canonical: "ISDIN", aliases: ["isdin"] },
  { canonical: "La Roche-Posay", aliases: ["la roche-posay", "la roche", "roche posay", "roche-posay", "lrp"] },
  { canonical: "Eucerin", aliases: ["eucerin"] },
  { canonical: "Avène", aliases: ["avene", "avène"] },
  { canonical: "Bioderma", aliases: ["bioderma"] },
  { canonical: "CeraVe", aliases: ["cerave", "cera ve"] },
  { canonical: "A-Derma", aliases: ["a-derma", "aderma", "a derma"] },
  { canonical: "Sesderma", aliases: ["sesderma"] },
  { canonical: "Uriage", aliases: ["uriage"] },
  { canonical: "Heliocare", aliases: ["heliocare"] },
  { canonical: "ACM", aliases: ["acm"] },
  { canonical: "Isispharma", aliases: ["isispharma", "isis pharma"] },
  { canonical: "Ducray", aliases: ["ducray"] },
  { canonical: "Vichy", aliases: ["vichy"] },
  { canonical: "Mustela", aliases: ["mustela"] },
  { canonical: "Cetaphil", aliases: ["cetaphil"] },
  { canonical: "Galderma", aliases: ["galderma"] },
  { canonical: "SVR", aliases: ["svr"] },
  { canonical: "Filorga", aliases: ["filorga"] },
  { canonical: "MartiDerm", aliases: ["martiderm", "marti derm"] },
  { canonical: "Neostrata", aliases: ["neostrata", "neo strata"] },
  { canonical: "SkinCeuticals", aliases: ["skinceuticals", "skin ceuticals"] },
];

const normalize = (s) =>
  (s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsAlias = (text, alias) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`, "i").test(text);

function matchLab(product, labs, brandName) {
  const nameN = normalize(product.name);
  const brandN = brandName ? normalize(brandName) : "";
  let best = null;
  const consider = (lab, alias, viaBrand) => {
    const score = alias.length + (viaBrand ? 1000 : 0);
    if (!best || score > best.score)
      best = { labId: lab.id, labName: lab.name, reason: viaBrand ? "marca" : `nombre «${alias}»`, score };
  };
  for (const lab of labs) {
    const labN = normalize(lab.name);
    const entry = LAB_ALIASES.find((a) => normalize(a.canonical) === labN);
    const aliases = new Set([labN, ...(entry?.aliases.map(normalize) ?? [])]);
    for (const alias of aliases) {
      if (alias.length < 2) continue;
      if (brandN && (brandN === alias || containsAlias(brandN, alias))) consider(lab, alias, true);
      else if (containsAlias(nameN, alias)) consider(lab, alias, false);
    }
  }
  return best;
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${res.status} ${path}`);
  return res.status === 204 ? null : res.json();
}

/** GET paginado (PostgREST limita a 1000 por página): trae TODAS las filas. */
async function restAll(path) {
  const page = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + page - 1}`,
      },
    });
    if (!res.ok) throw new Error(`REST ${res.status} ${path}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  const labs = await rest("laboratories?select=id,name,business_id");
  // Asegura ACM e Isispharma (no venían en la semilla) antes de asignar.
  if (APPLY) {
    const want = [["ACM", "Francia"], ["Isispharma", "Francia"]];
    for (const biz of [...new Set(labs.map((l) => l.business_id))]) {
      const have = new Set(labs.filter((l) => l.business_id === biz).map((l) => normalize(l.name)));
      for (const [name, country] of want) {
        if (!have.has(normalize(name))) {
          const c = await rest("laboratories", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ business_id: biz, name, country }),
          });
          if (Array.isArray(c) && c[0]) labs.push({ id: c[0].id, name, business_id: biz });
        }
      }
    }
  }
  const brands = await rest("brands?select=id,name");
  const brandById = new Map(brands.map((b) => [b.id, b.name]));
  const products = await restAll("products?select=id,sku,name,brand_id,laboratory_id,business_id&deleted_at=is.null");

  const labsByBiz = new Map();
  for (const l of labs) {
    if (!labsByBiz.has(l.business_id)) labsByBiz.set(l.business_id, []);
    labsByBiz.get(l.business_id).push(l);
  }

  let alreadyAssigned = 0;
  const assignments = [];
  const pending = [];
  for (const p of products) {
    if (p.laboratory_id) {
      alreadyAssigned += 1;
      continue;
    }
    const brandName = p.brand_id ? brandById.get(p.brand_id) : undefined;
    const m = matchLab({ name: p.name }, labsByBiz.get(p.business_id) ?? [], brandName);
    if (m) assignments.push({ id: p.id, sku: p.sku, name: p.name, labId: m.labId, labName: m.labName, reason: m.reason });
    else pending.push({ id: p.id, sku: p.sku, name: p.name, brand: brandName ?? "", reason: "sin coincidencia confiable" });
  }

  if (APPLY) {
    for (const a of assignments) {
      await rest(`products?id=eq.${a.id}&laboratory_id=is.null`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ laboratory_id: a.labId }),
      });
    }
  }

  try {
    mkdirSync("reports", { recursive: true });
    const csv = [
      "SKU,Nombre,Marca,Sugerencia,Motivo",
      ...pending.map((p) => [p.sku, p.name, p.brand, "", p.reason].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");
    writeFileSync("reports/product-laboratory-backfill-pending.csv", csv);
  } catch {}

  console.log(`Productos revisados: ${products.length}`);
  console.log(`Ya tenían laboratorio: ${alreadyAssigned}`);
  console.log(`${APPLY ? "Asignados" : "Asignables (dry run)"}: ${assignments.length}`);
  console.log(`Pendientes manuales: ${pending.length}`);
  console.log(`Duplicados evitados: 0 (solo se tocan productos con laboratory_id nulo)`);
  if (!APPLY) console.log("\n(Ejecuta con --apply para escribir los cambios.)");
}

main().catch((e) => {
  console.error("No se pudo completar el backfill:", e.message);
  process.exit(1);
});
