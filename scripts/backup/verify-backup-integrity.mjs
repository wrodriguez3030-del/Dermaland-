#!/usr/bin/env node
/**
 * Verifica que un backup JSON (de rest-json-backup.mjs) es RESTAURABLE: comprueba
 * la integridad referencial (todas las FKs resuelven DENTRO del export). Si pasa,
 * el import en orden de FKs no fallará por violaciones → el backup se puede
 * restaurar limpio. No toca ninguna base de datos; solo lee los JSON.
 *
 * Uso: node scripts/backup/verify-backup-integrity.mjs [carpeta_backup]
 *   (por defecto usa la carpeta backups/rest-* más reciente)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const backupsDir = path.join(root, "backups");

function latestRestDir() {
  if (!existsSync(backupsDir)) return null;
  const dirs = readdirSync(backupsDir).filter((d) => d.startsWith("rest-")).sort();
  return dirs.length ? path.join(backupsDir, dirs[dirs.length - 1]) : null;
}

const dir = process.argv[2] ? path.resolve(process.argv[2]) : latestRestDir();
if (!dir || !existsSync(dir)) {
  console.error("No hay backup. Corré primero: node scripts/backup/rest-json-backup.mjs");
  process.exit(1);
}
console.log(`Verificando: ${dir}\n`);

const load = (t) => {
  const f = path.join(dir, `${t}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
};
const idSet = (rows, key = "id") => new Set(rows.map((r) => r[key]));

// Cargar tablas referenciadas.
const businesses = idSet(load("businesses"));
const branches = load("branches");
const branchIds = idSet(branches);
const warehouses = load("warehouses");
const warehouseIds = idSet(warehouses);
const users = idSet(load("users"));
const products = idSet(load("products"));
const productLots = load("product_lots");
const productLotIds = idSet(productLots);
const proformas = load("proformas");
const proformaIds = idSet(proformas);

let pass = 0, fail = 0;
const check = (name, rows, checks) => {
  let bad = 0;
  for (const r of rows) {
    for (const [col, set] of checks) {
      const v = r[col];
      if (v != null && !set.has(v)) bad++;
    }
  }
  if (bad === 0) { pass++; console.log(`  ✅ ${name} (${rows.length} filas, FKs OK)`); }
  else { fail++; console.log(`  ❌ ${name}: ${bad} referencias rotas`); }
};

console.log("── Integridad referencial (todas las FKs resuelven dentro del backup) ──");
check("branches.business_id", branches, [["business_id", businesses]]);
check("warehouses", warehouses, [["business_id", businesses], ["branch_id", branchIds]]);
check("users.business_id", load("users").map((u) => u), [["business_id", businesses]]);
check("clients.business_id", load("clients"), [["business_id", businesses]]);
check("products.business_id", load("products"), [["business_id", businesses]]);
check("product_lots", productLots, [
  ["business_id", businesses], ["product_id", products],
  ["branch_id", branchIds], ["warehouse_id", warehouseIds],
]);
check("proformas", proformas, [
  ["business_id", businesses], ["branch_id", branchIds], ["cashier_id", users],
]);
check("proforma_items", load("proforma_items"), [
  ["business_id", businesses], ["proforma_id", proformaIds],
]);
check("proforma_payments", load("proforma_payments"), [
  ["business_id", businesses], ["proforma_id", proformaIds], ["user_id", users],
]);
check("inventory_movements", load("inventory_movements"), [
  ["business_id", businesses], ["branch_id", branchIds],
  ["product_id", products], ["warehouse_id", warehouseIds],
]);
check("inventory_count_items", load("inventory_count_items"), [
  ["business_id", businesses], ["product_id", products],
]);

console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
if (fail === 0) {
  console.log("El backup es RESTAURABLE: sin referencias rotas. Import en orden de FKs no violará constraints.");
}
process.exit(fail === 0 ? 0 : 1);
