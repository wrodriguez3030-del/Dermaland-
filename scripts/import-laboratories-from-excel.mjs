#!/usr/bin/env node
// Importa laboratorios desde un Excel (columna A = laboratorio, columnas B en
// adelante = marcas/palabras clave que identifican productos de ese laboratorio)
// y asigna laboratory_id a productos que AÚN NO lo tienen. NUNCA sobreescribe un
// laboratorio ya asignado. No borra nada.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-laboratories-from-excel.mjs <archivo.xlsx> [--apply]
//
// Sin --apply hace un "dry run" (solo imprime el resumen + reports/*.csv).
// Con --apply crea los laboratorios que falten y asigna los productos que hagan match.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// xlsx vive en apps/web/node_modules
const require = createRequire(path.join(root, "apps/web/package.json"));
const XLSX = require("xlsx");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL)?.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const FILE = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local.");
  process.exit(1);
}
if (!FILE) {
  console.error("Uso: node scripts/import-laboratories-from-excel.mjs <archivo.xlsx> [--apply]");
  process.exit(1);
}

const normalize = (s) =>
  (s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsAlias = (text, alias) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`, "i").test(text);

// ─── 1. Leer Excel: columna A = laboratorio, columnas B+ = palabras clave ────
function readLabRows(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const byLab = new Map(); // normalized(labName) -> { labName, keywords: Set }
  for (const row of rows) {
    const [labNameRaw, ...rest] = row.map((c) => String(c ?? "").trim());
    if (!labNameRaw) continue;
    const key = normalize(labNameRaw);
    if (!byLab.has(key)) byLab.set(key, { labName: labNameRaw, keywords: new Set() });
    const entry = byLab.get(key);
    entry.keywords.add(labNameRaw); // el propio nombre también cuenta como palabra clave
    for (const cell of rest) {
      if (cell) entry.keywords.add(cell);
    }
  }
  return [...byLab.values()];
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
  if (!res.ok) throw new Error(`REST ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function restAll(path) {
  const page = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + page - 1}` },
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
  const excelLabs = readLabRows(FILE);
  console.log(`Excel: ${excelLabs.length} laboratorios distintos (columna A) leídos.`);

  // Solo el negocio real DermaLand SRL. NUNCA tocar el tenant de prueba
  // (8be34957-17b7-4f3b-9357-32204c524336, "CNTTEST ct5jmp").
  const businessId = "00000000-0000-0000-0000-00000000d001";
  const allLabs = await rest("laboratories?select=id,name,country,business_id");
  const labs = allLabs.filter((l) => l.business_id === businessId);
  const labByNorm = new Map(labs.map((l) => [normalize(l.name), l]));

  // ─── 2. Crear los laboratorios que falten (columna A) ───────────────────
  const toCreate = excelLabs.filter((e) => !labByNorm.has(normalize(e.labName)));
  console.log(`Laboratorios nuevos a crear: ${toCreate.length}`);
  for (const e of toCreate) console.log(`  + ${e.labName}`);

  if (APPLY) {
    for (const e of toCreate) {
      const created = await rest("laboratories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ business_id: businessId, name: e.labName, country: "República Dominicana" }),
      });
      const row = Array.isArray(created) ? created[0] : created;
      labByNorm.set(normalize(e.labName), row);
    }
  } else {
    // Dry run: registra un id provisional para que el conteo de coincidencias
    // sea real aunque el laboratorio todavía no exista en la base.
    for (const e of toCreate) {
      labByNorm.set(normalize(e.labName), { id: "(nuevo)", name: e.labName });
    }
  }

  // ─── 3. Emparejar productos sin laboratorio ──────────────────────────────
  const products = await restAll(
    `products?select=id,sku,name,brand_id,laboratory_id,business_id&business_id=eq.${businessId}&deleted_at=is.null&laboratory_id=is.null`,
  );
  console.log(`Productos sin laboratorio: ${products.length}`);

  // Índice de keywords -> lab (excel), eligiendo el keyword MÁS ESPECÍFICO (más largo) ante empate.
  const keywordEntries = [];
  for (const e of excelLabs) {
    for (const kw of e.keywords) {
      if (normalize(kw).length < 2) continue;
      keywordEntries.push({ kw, kwN: normalize(kw), labName: e.labName });
    }
  }

  function matchProduct(name) {
    const nameN = normalize(name);
    let best = null;
    for (const entry of keywordEntries) {
      if (!containsAlias(nameN, entry.kwN)) continue;
      if (!best || entry.kwN.length > best.kwN.length) best = entry;
    }
    return best;
  }

  const assignments = [];
  const pending = [];
  for (const p of products) {
    const m = matchProduct(p.name);
    if (!m) {
      pending.push({ id: p.id, sku: p.sku, name: p.name });
      continue;
    }
    const lab = labByNorm.get(normalize(m.labName));
    if (!lab) {
      // Solo puede pasar en dry-run (el laboratorio nuevo aún no existe en `labByNorm`).
      pending.push({ id: p.id, sku: p.sku, name: p.name, wouldMatch: `${m.labName} (vía «${m.kw}»)` });
      continue;
    }
    assignments.push({ id: p.id, sku: p.sku, name: p.name, labId: lab.id, labName: lab.name, via: m.kw });
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
    const csvA = [
      "SKU,Nombre,Laboratorio,Via",
      ...assignments.map((a) => [a.sku, a.name, a.labName, a.via].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");
    writeFileSync("reports/laboratory-import-assignments.csv", csvA);
    const csvP = [
      "SKU,Nombre",
      ...pending.map((p) => [p.sku, p.name].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");
    writeFileSync("reports/laboratory-import-pending.csv", csvP);
  } catch {}

  console.log(`\nLaboratorios ${APPLY ? "creados" : "a crear"}: ${toCreate.length}`);
  console.log(`Productos ${APPLY ? "asignados" : "asignables (dry run)"}: ${assignments.length}`);
  console.log(`Productos sin coincidencia: ${pending.length}`);
  if (!APPLY) console.log("\n(Ejecuta con --apply para escribir los cambios.)");
}

main().catch((e) => {
  console.error("No se pudo completar la importación:", e.message);
  process.exit(1);
});
