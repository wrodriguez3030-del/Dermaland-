#!/usr/bin/env node
// Asigna laboratorio a productos por SKU EXPLÍCITO, desde un Excel con
// columnas SKU, Nombre, Laboratorio, Fuente verificación (el mismo formato
// que exporta `productos/laboratorios` → "Sin laboratorio", completado a
// mano o por investigación externa). A diferencia de
// import-laboratories-from-excel.mjs (que busca palabras clave en el
// nombre), aquí el laboratorio YA viene decidido por fila: no hay matching,
// solo find-or-create + UPDATE por SKU.
//
// Filas con Laboratorio = "No aplica" o "Sin marca/laboratorio
// identificable" (o vacío) se OMITEN: no son productos dermocosméticos
// reales (delivery, tarjetas de certificado) o no se pudo identificar la
// marca, y no se inventa un laboratorio para ellos.
//
// NUNCA sobreescribe un laboratory_id ya asignado. No borra nada. No toca el
// tenant de prueba.
//
// Uso:
//   node scripts/import-laboratories-by-sku.mjs <archivo.xlsx> [--apply]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  console.error("Uso: node scripts/import-laboratories-by-sku.mjs <archivo.xlsx> [--apply]");
  process.exit(1);
}

// Solo el negocio real DermaLand SRL. NUNCA el tenant de prueba
// (8be34957-17b7-4f3b-9357-32204c524336, "CNTTEST ct5jmp").
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";

const NO_APLICA = new Set(["no aplica", "sin marca/laboratorio identificable", ""]);

const normalize = (s) =>
  (s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

function leerFilas(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const [, ...data] = rows;
  const out = [];
  for (const row of data) {
    const sku = String(row[0] ?? "").trim();
    const nombre = String(row[1] ?? "").trim();
    const labRaw = String(row[2] ?? "").trim();
    if (!sku) continue;
    if (NO_APLICA.has(normalize(labRaw))) continue;
    out.push({ sku, nombre, labName: labRaw });
  }
  return out;
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
  const filas = leerFilas(FILE);
  console.log(`Excel: ${filas.length} filas con laboratorio identificado (de las que traía el archivo).`);

  const allLabs = await rest("laboratories?select=id,name,business_id");
  const labs = allLabs.filter((l) => l.business_id === BUSINESS_ID);
  const labByNorm = new Map(labs.map((l) => [normalize(l.name), l]));

  const nombresUnicos = [...new Set(filas.map((f) => f.labName))];
  const porCrear = nombresUnicos.filter((n) => !labByNorm.has(normalize(n)));
  console.log(`Laboratorios nuevos a crear: ${porCrear.length}`);
  for (const n of porCrear) console.log(`  + ${n}`);

  if (APPLY) {
    for (const n of porCrear) {
      const created = await rest("laboratories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ business_id: BUSINESS_ID, name: n, country: "" }),
      });
      const row = Array.isArray(created) ? created[0] : created;
      labByNorm.set(normalize(n), row);
    }
  } else {
    for (const n of porCrear) labByNorm.set(normalize(n), { id: "(nuevo)", name: n });
  }

  const productos = await restAll(
    `products?select=id,sku,name,laboratory_id&business_id=eq.${BUSINESS_ID}&deleted_at=is.null`,
  );
  const productBySku = new Map(productos.map((p) => [p.sku, p]));

  const asignaciones = [];
  const yaAsignados = [];
  const noEncontrados = [];
  for (const f of filas) {
    const p = productBySku.get(f.sku);
    if (!p) {
      noEncontrados.push(f);
      continue;
    }
    if (p.laboratory_id) {
      yaAsignados.push(f);
      continue;
    }
    const lab = labByNorm.get(normalize(f.labName));
    asignaciones.push({ id: p.id, sku: f.sku, nombre: f.nombre, labId: lab.id, labName: lab.name });
  }

  if (APPLY) {
    for (const a of asignaciones) {
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
      "SKU,Nombre,Laboratorio",
      ...asignaciones.map((a) => [a.sku, a.nombre, a.labName].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\r\n");
    writeFileSync("reports/laboratory-by-sku-assignments.csv", csv);
  } catch {}

  console.log(`\nLaboratorios ${APPLY ? "creados" : "a crear"}: ${porCrear.length}`);
  console.log(`Productos ${APPLY ? "asignados" : "asignables (dry run)"}: ${asignaciones.length}`);
  console.log(`SKU no encontrado en el catálogo: ${noEncontrados.length}`);
  console.log(`Ya tenían laboratorio (no tocados): ${yaAsignados.length}`);
  if (noEncontrados.length) {
    console.log("\nSKU no encontrados:");
    for (const f of noEncontrados) console.log(`  ${f.sku} — ${f.nombre}`);
  }
  if (yaAsignados.length) {
    console.log("\nYa asignados (no tocados):");
    for (const f of yaAsignados) console.log(`  ${f.sku} — ${f.nombre}`);
  }
  if (!APPLY) console.log("\n(Ejecuta con --apply para escribir los cambios.)");
}

main().catch((e) => {
  console.error("No se pudo completar la importación:", e.message);
  process.exit(1);
});
