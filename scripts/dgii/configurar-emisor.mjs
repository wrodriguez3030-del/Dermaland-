#!/usr/bin/env node
/**
 * Carga la configuración fiscal del emisor en `dgii_settings`.
 *
 * Es un dato, no un interruptor: deja el ambiente en `testecf` y el envío real
 * APAGADO. Sin certificado de la empresa y sin rangos autorizados por la DGII,
 * esta fila no emite nada — solo deja escrito quién es el emisor.
 *
 * Los códigos de provincia y municipio son los del XSD oficial que publica la
 * DGII (`features/dgii/core/xsd/e-CF-32-v1.0.xsd`), no texto libre: la fase 2
 * cambió esas columnas a código.
 *
 *   node scripts/dgii/configurar-emisor.mjs            # simula, no escribe
 *   node scripts/dgii/configurar-emisor.mjs --apply    # escribe
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
// `pg` se resuelve desde apps/web, igual que scripts/db/apply-migration.mjs.
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");

const EMISOR = {
  business_id: "00000000-0000-0000-0000-00000000d001",
  rnc_emisor: "132590775",                       // 1-32-59077-5 sin guiones, como va en el XML
  razon_social_emisor: "DERMALAND SRL",
  direccion_emisor: "Calle Restauración #45, Santiago de los Caballeros",
  provincia_codigo: "250000",                    // PROVINCIA SANTIAGO
  municipio_codigo: "250100",                    // MUNICIPIO SANTIAGO
  correo_emisor: "dermalandrd@gmail.com",
  telefono_emisor: "8092265252",                 // sin espacios ni signos: la DGII los rechaza
  ambiente: "testecf",                           // pruebas, a propósito
  dgii_enabled_real_send: false,                 // apagado, a propósito
};

function urlDeLaBase() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  if (!m) throw new Error("Falta SUPABASE_DB_URL");
  return m[1].replace(/^"|"$/g, "");
}

const cols = Object.keys(EMISOR);
const vals = Object.values(EMISOR);
const sql = `insert into public.dgii_settings (${cols.join(", ")})
values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
on conflict (business_id) do update set
  ${cols.slice(1).map((c) => `${c} = excluded.${c}`).join(",\n  ")},
  updated_at = now()
returning business_id, rnc_emisor, razon_social_emisor, ambiente, dgii_enabled_real_send`;

console.log(`\n${APPLY ? "▶ ESCRIBIENDO" : "🔍 simulación (sin --apply no escribe)"}\n`);
for (const [k, v] of Object.entries(EMISOR)) console.log(`  ${k.padEnd(24)} ${v}`);

if (!APPLY) {
  console.log("\nPara escribirlo de verdad: node scripts/dgii/configurar-emisor.mjs --apply\n");
  process.exit(0);
}

const cliente = new Client({
  connectionString: urlDeLaBase(),
  ssl: { ca: readFileSync(path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await cliente.connect();
const r = await cliente.query(sql, vals);
console.log("\n✓ guardado:", JSON.stringify(r.rows[0], null, 2));
await cliente.end();
