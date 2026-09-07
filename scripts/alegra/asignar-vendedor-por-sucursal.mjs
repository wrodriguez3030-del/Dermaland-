#!/usr/bin/env node
/**
 * Reparte por SUCURSAL las facturas migradas que Alegra dejó SIN VENDEDOR.
 *
 * Alegra no anotó vendedor en 8 197 facturas. `vincular-vendedores.mjs` las
 * había atado a un usuario «Oficina», que no es una persona y no cobra
 * comisiones. El dueño sabe quién atendía cada sucursal, así que se atribuyen
 * a la encargada correspondiente.
 *
 * 🔴 SOLO toca las que NO tienen vendedor en Alegra. Las de Desteny y Laura se
 * quedan como están: ellas sí firmaron sus ventas y reasignarlas les borraría
 * el historial y la comisión.
 *
 * 🔴 NO se modifica `alegra_invoices.seller_name`: ese campo es el dato tal como
 * vino de Alegra y Alegra manda. Lo que se escribe es `seller_id`, que es la
 * columna de DermaLand para atribuir. El nombre que se ve en los reportes sale
 * del usuario enlazado, no de ese texto.
 *
 *   node scripts/alegra/asignar-vendedor-por-sucursal.mjs            # simula
 *   node scripts/alegra/asignar-vendedor-por-sucursal.mjs --apply    # escribe
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client } = require("pg");
const APPLY = process.argv.includes("--apply");
const BUSINESS = "00000000-0000-0000-0000-00000000d001";

/** Sucursal (por nombre, como está en `branches`) → quién la atendía. */
const POR_SUCURSAL = [
  {
    sucursal: "Dermaland  Villa Olga",
    nombre: "Soribel Tejada",
    correo: "soribel.tejada@dermaland.local",
  },
  {
    sucursal: "DermaLand Principal",
    nombre: "Heidi Pinales",
    correo: "heidi.pinales@dermaland.local",
  },
];

/**
 * 🔴 UN SOLO `where`, para contar Y para escribir.
 *
 * En el guion de vendedores, contar con un predicado y escribir con otro hizo
 * que la simulación informara 0 facturas y el `--apply` tocara 14 743. Aquí la
 * condición vive en una sola función: si cambia, cambia para los dos.
 *
 * `seller_id` NO entra en la condición a propósito: estas facturas ya están
 * atadas a «Oficina», así que filtrar por «sin seller_id» no encontraría
 * ninguna. Lo que las define es no tener vendedor EN ALEGRA.
 */
function condicion(sucursalId) {
  return {
    where: `
      business_id = $1
      and status not in ('void', 'draft')
      and coalesce(trim(seller_name), '') = ''
      and branch_id = $2`,
    args: [BUSINESS, sucursalId],
  };
}

function url() {
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  return env.match(/^SUPABASE_DB_URL=(.*)$/m)[1].replace(/^"|"$/g, "");
}

const c = new Client({
  connectionString: url(),
  ssl: {
    ca: readFileSync(path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});

const dinero = (n) =>
  "RD$" + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

await c.connect();
console.log(`\n${APPLY ? "▶ ESCRIBIENDO" : "🔍 simulación (sin --apply no escribe)"}\n`);
if (APPLY) await c.query("begin");

try {
  for (const v of POR_SUCURSAL) {
    const suc = await c.query(
      "select id from public.branches where business_id = $1 and name = $2",
      [BUSINESS, v.sucursal],
    );
    if (!suc.rows[0]) {
      console.log(`  ✗ no encuentro la sucursal «${v.sucursal}». No se toca nada.`);
      process.exitCode = 1;
      break;
    }
    const sucursalId = suc.rows[0].id;

    // ── la persona ──
    const existente = await c.query(
      "select id, role from public.users where business_id = $1 and lower(full_name) = lower($2) and deleted_at is null",
      [BUSINESS, v.nombre],
    );
    let id = existente.rows[0]?.id ?? null;
    if (!id) {
      if (APPLY) {
        const ins = await c.query(
          `insert into public.users (business_id, email, full_name, role, status)
           values ($1, $2, $3, 'vendedor', 'active') returning id`,
          [BUSINESS, v.correo, v.nombre],
        );
        id = ins.rows[0].id;
      }
      console.log(`  + usuaria nueva: ${v.nombre.padEnd(18)} rol vendedor  ${v.correo}`);
    } else {
      console.log(`  · ya existía:    ${v.nombre.padEnd(18)} rol ${existente.rows[0].role}`);
    }

    // ── las facturas ──
    const { where, args } = condicion(sucursalId);
    const cuenta = await c.query(
      `select count(*)::int n, coalesce(sum(total), 0) t from public.alegra_invoices where ${where}`,
      args,
    );
    const { n, t } = cuenta.rows[0];
    console.log(`      ${v.sucursal}: ${n} facturas · ${dinero(t)}`);

    if (!APPLY || n === 0) continue;

    const upd = await c.query(
      `update public.alegra_invoices set seller_id = $3, updated_at = now() where ${where}`,
      [...args, id],
    );
    if (upd.rowCount !== n) {
      console.log(`\n  🔴 se anunciaron ${n} y se escribieron ${upd.rowCount}. Se deshace todo.`);
      await c.query("rollback");
      process.exitCode = 1;
      await c.end();
      process.exit();
    }
    console.log(`      ✓ ${upd.rowCount} atadas a ${v.nombre}`);
  }

  // ── el reparto que queda ──
  const reparto = await c.query(
    `select coalesce(u.full_name, '(sin atar)') v, count(*)::int n, coalesce(sum(ai.total), 0) t
       from public.alegra_invoices ai
       left join public.users u on u.id = ai.seller_id
      where ai.business_id = $1 and ai.status not in ('void', 'draft')
      group by 1 order by 2 desc`,
    [BUSINESS],
  );
  console.log(`\n  ── reparto ${APPLY ? "RESULTANTE" : "ACTUAL, antes de aplicar"} ──`);
  for (const r of reparto.rows) {
    console.log(`  ${String(r.v).padEnd(20)} ${String(r.n).padStart(6)}  ${dinero(r.t)}`);
  }

  if (APPLY) {
    await c.query("commit");
    console.log("\n✓ guardado\n");
  } else {
    console.log("\nPara escribirlo: node scripts/alegra/asignar-vendedor-por-sucursal.mjs --apply\n");
  }
} catch (e) {
  if (APPLY) await c.query("rollback");
  console.error("\n  🔴 " + e.message + "\n  No se escribió nada.\n");
  process.exitCode = 1;
} finally {
  await c.end();
}
