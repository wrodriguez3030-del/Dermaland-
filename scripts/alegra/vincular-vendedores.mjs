#!/usr/bin/env node
/**
 * Crea los vendedores del histórico de Alegra y ata cada factura al suyo.
 *
 * Alegra guarda el vendedor como texto libre. Aquí se crean como usuarios de
 * DermaLand con rol `vendedor` y se rellena `alegra_invoices.seller_id`.
 *
 * Las 8 197 facturas que Alegra dejó SIN vendedor van a un usuario llamado
 * «Oficina»: fueron ventas de mostrador sin vendedor asignado, y decirlo así es
 * más honesto que inventarles un dueño o dejarlas huérfanas. Ojo para el futuro:
 * «Oficina» NO es una persona, así que no debe cobrar comisiones.
 *
 * Esta pasada NO calcula ni registra ninguna comisión. Solo atribuye.
 *
 *   node scripts/alegra/vincular-vendedores.mjs            # simula
 *   node scripts/alegra/vincular-vendedores.mjs --apply    # escribe
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");
const BUSINESS = "00000000-0000-0000-0000-00000000d001";

/** El nombre en Alegra → cómo queda en DermaLand. `null` = las que no traen vendedor. */
const VENDEDORES = [
  { alegra: "DESTENY REYNOSO", nombre: "Desteny Reynoso", correo: "desteny.reynoso@dermaland.local" },
  { alegra: "LAURA MEJIA",     nombre: "Laura Mejía",     correo: "laura.mejia@dermaland.local" },
  { alegra: "DARIO",           nombre: "Dario",           correo: null },  // ya existe como usuario
  { alegra: null,              nombre: "Oficina",         correo: "oficina@dermaland.local" },
];

function url() {
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  return env.match(/^SUPABASE_DB_URL=(.*)$/m)[1].replace(/^"|"$/g, "");
}

const c = new Client({
  connectionString: url(),
  ssl: { ca: readFileSync(path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

// La columna la crea la migración 20260906120000_alegra_vendedor.sql. Sin ella
// no hay dónde escribir, y conviene decirlo claro en vez de fallar por dentro.
const tiene = await c.query(
  `select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'alegra_invoices' and column_name = 'seller_id'`,
);
if (tiene.rows.length === 0) {
  console.error("\n✗ Falta la columna `seller_id` en alegra_invoices.");
  console.error("  Aplica primero la migración:");
  console.error("  node scripts/db/apply-migration.mjs supabase/migrations/20260906120000_alegra_vendedor.sql --apply\n");
  await c.end();
  process.exit(1);
}

console.log(`\n${APPLY ? "▶ ESCRIBIENDO" : "🔍 simulación (sin --apply no escribe)"}\n`);
if (APPLY) await c.query("begin");

try {
  for (const v of VENDEDORES) {
    // ── el usuario ──
    let { rows } = await c.query(
      "select id, full_name, role from public.users where business_id = $1 and lower(full_name) = lower($2) and deleted_at is null",
      [BUSINESS, v.nombre],
    );
    let id = rows[0]?.id ?? null;

    if (!id) {
      if (!v.correo) { console.log(`  ✗ ${v.nombre}: no existe y no tengo correo para crearlo`); continue; }
      if (APPLY) {
        const ins = await c.query(
          `insert into public.users (business_id, email, full_name, role, status)
           values ($1, $2, $3, 'vendedor', 'active') returning id`,
          [BUSINESS, v.correo, v.nombre],
        );
        id = ins.rows[0].id;
      }
      console.log(`  + usuario nuevo: ${v.nombre.padEnd(20)} rol vendedor  ${v.correo}`);
    } else {
      console.log(`  · ya existía:    ${v.nombre.padEnd(20)} rol ${rows[0].role}`);
    }

    // ── las facturas ──
    const filtro = v.alegra === null
      ? "and (seller_name is null or trim(seller_name) = '')"
      : "and upper(trim(seller_name)) = upper($3)";
    const args = v.alegra === null ? [BUSINESS, id] : [BUSINESS, id, v.alegra];

    const cuenta = await c.query(
      `select count(*)::int n from public.alegra_invoices
       where business_id = $1 and seller_id is distinct from $2 ${filtro}`,
      args,
    );
    const n = cuenta.rows[0].n;

    if (APPLY && id && n > 0) {
      await c.query(
        `update public.alegra_invoices set seller_id = $2, updated_at = now()
         where business_id = $1 and seller_id is distinct from $2 ${filtro}`,
        args,
      );
    }
    console.log(`      ${String(n).padStart(6)} facturas ${APPLY ? "atadas" : "se atarían"}\n`);
  }

  // ── verificación ──
  const v = await c.query(
    `select coalesce(u.full_name, '(sin atar)') vendedor, count(*)::int n,
            sum(a.total)::numeric(14,2) m
     from public.alegra_invoices a
     left join public.users u on u.id = a.seller_id
     where a.business_id = $1 and a.status not in ('void','draft')
     group by 1 order by n desc`,
    [BUSINESS],
  );
  console.log("  ── reparto resultante (facturas no anuladas) ──");
  for (const r of v.rows) {
    console.log("  " + String(r.vendedor).padEnd(22) + String(r.n).padStart(6) + "  RD$" + Number(r.m).toLocaleString("es-DO"));
  }

  if (APPLY) { await c.query("commit"); console.log("\n✓ guardado\n"); }
  else console.log("\nPara escribirlo: node scripts/alegra/vincular-vendedores.mjs --apply\n");
} catch (e) {
  if (APPLY) await c.query("rollback");
  console.error("\n✗ Error (nada se guardó):", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
