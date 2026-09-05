#!/usr/bin/env node
/**
 * Comprueba credenciales y esquema esperado de Alegra SIN escribir nada.
 * Se corre antes de cualquier `alegra-sync.mts --apply`.
 *
 *   node scripts/test/alegra-live-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(path.join(ROOT, "apps/web/.env.local"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
} catch {
  /* en CI todo viene de process.env */
}
const EMAIL = process.env.ALEGRA_EMAIL ?? env.ALEGRA_EMAIL;
const TOKEN = process.env.ALEGRA_TOKEN ?? env.ALEGRA_TOKEN;
if (!EMAIL || !TOKEN) {
  console.error("✗ Faltan ALEGRA_EMAIL / ALEGRA_TOKEN");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const g = async (p) => {
  const r = await fetch(`https://api.alegra.com/api/v1/${p}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
};

const fallos = [];
const check = (cond, msg) => {
  if (!cond) fallos.push(msg);
};

try {
  const company = await g("company");
  check(company.name === "DermaLand", `empresa inesperada: ${company.name}`);

  const wh = await g("warehouses");
  check(
    wh.some((w) => String(w.id) === "1") && wh.some((w) => String(w.id) === "2"),
    `faltan los almacenes 1/2: ${wh.map((w) => `${w.id}:${w.name}`).join(", ")}`,
  );

  const [item] = await g("items?limit=1&fields=customFields");
  check(!!item && Array.isArray(item.price), "ítem sin lista de precios");
  check(!!item && "inventory" in item, "ítem sin inventory");

  const [contact] = await g("contacts?limit=1&type=client");
  check(!!contact && Array.isArray(contact.type), "contacto sin type");

  const [inv] = await g("invoices?limit=1");
  check(!!inv && !!inv.numberTemplate, "factura sin numberTemplate (NCF)");
  check(!!inv && Array.isArray(inv.items), "factura sin items");
  check(!!inv && "balance" in inv, "factura sin balance");

  if (fallos.length) {
    console.error(`✗ ${fallos.join(" · ")}`);
    process.exit(1);
  }
  console.log(`✓ Alegra OK: ${company.name}, almacenes ${wh.map((w) => w.name).join("/")}`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
