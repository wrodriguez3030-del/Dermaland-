#!/usr/bin/env node
/**
 * Repara sucursales existentes: garantiza que cada sucursal activa tenga su
 * ubicación interna (almacén por defecto) para poder recibir inventario, sin
 * que el usuario configure nada. El inventario es por SUCURSAL; el almacén es
 * interno y nunca se muestra en la UI.
 *
 * Idempotente y SEGURO:
 *   - NO borra, NO resetea, NO trunca, NO toca stock ni movimientos.
 *   - Solo INSERTA el almacén interno cuando falta (code determinista
 *     `auto-<branchId>`, is_main=true). Re-ejecutable sin duplicar.
 *
 * Uso:
 *   node scripts/ensure-branch-warehouses.mjs --dry-run   # solo reporta
 *   node scripts/ensure-branch-warehouses.mjs             # crea los que falten
 *
 * Lee apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (usa service_role; NO lo imprime).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");
const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const INTERNAL_NAME = "Inventario";
const DRY = process.argv.includes("--dry-run");

function die(m) {
  console.error(`[ensure-wh] ${m}`);
  process.exit(1);
}
function ok(m) {
  console.log(`[ensure-wh] ${m}`);
}

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) die(`no encontré ${ENV_PATH}`);
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || /replace/i.test(key)) {
    die("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY reales");
  }

  let createClient;
  try {
    const require = createRequire(
      pathToFileURL(path.join(REPO_ROOT, "apps", "web", "package.json")),
    );
    const entry = require.resolve("@supabase/supabase-js");
    const mod = await import(pathToFileURL(entry).href);
    createClient = mod.createClient;
  } catch (e) {
    die(
      `no pude importar @supabase/supabase-js desde apps/web/node_modules. ` +
        `Corre 'pnpm install' primero. Detalle: ${e?.message ?? e}`,
    );
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Sucursales activas (no borradas) del negocio.
  const { data: branches, error: brErr } = await sb
    .from("branches")
    .select("id, name, status")
    .eq("business_id", BUSINESS_ID)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name", { ascending: true });
  if (brErr) die(`leyendo sucursales: ${brErr.message}`);
  ok(`sucursales activas: ${branches.length}`);

  let created = 0;
  let already = 0;
  for (const b of branches) {
    const { data: existing, error: whErr } = await sb
      .from("warehouses")
      .select("id, is_main")
      .eq("business_id", BUSINESS_ID)
      .eq("branch_id", b.id)
      .order("is_main", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (whErr) die(`leyendo almacén de ${b.name}: ${whErr.message}`);

    if (existing) {
      already += 1;
      ok(`OK  "${b.name}" → ya tiene ubicación interna (${existing.id})`);
      continue;
    }

    if (DRY) {
      ok(`FALTA "${b.name}" → se crearía ubicación interna (dry-run, sin escribir)`);
      created += 1;
      continue;
    }

    const code = `auto-${b.id}`;
    const { data: ins, error: insErr } = await sb
      .from("warehouses")
      .insert({
        business_id: BUSINESS_ID,
        branch_id: b.id,
        code,
        name: INTERNAL_NAME,
        is_main: true,
      })
      .select("id")
      .single();
    if (insErr) {
      // 23505 = otro proceso lo creó (carrera). No es error real.
      if (insErr.code === "23505") {
        already += 1;
        ok(`OK  "${b.name}" → ya existía (carrera), no se duplica`);
        continue;
      }
      die(`creando almacén de ${b.name}: ${insErr.message}`);
    }
    created += 1;
    ok(`NEW "${b.name}" → ubicación interna creada (${ins.id})`);
  }

  ok(
    `${DRY ? "DRY-RUN " : ""}resumen: ${branches.length} sucursales · ` +
      `${already} ya tenían · ${created} ${DRY ? "a crear" : "creadas"}`,
  );
  ok("listo (no se borró ni modificó stock/movimientos).");
}

main().catch((e) => die(e?.message ?? String(e)));
