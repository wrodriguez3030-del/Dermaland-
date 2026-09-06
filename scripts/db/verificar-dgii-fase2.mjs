#!/usr/bin/env node
/**
 * Comprueba que la fase 2 quedó bien en la base REAL.
 *
 * Todo ocurre dentro de una transacción que SIEMPRE termina en ROLLBACK: crea un
 * negocio y una secuencia de mentira, reserva números, provoca las carreras, y
 * lo deshace. No deja una fila.
 *
 *   node scripts/db/verificar-dgii-fase2.mjs
 *
 * Requiere SUPABASE_DB_URL (se lee de apps/web/.env.local si no está en el entorno),
 * igual que scripts/db/apply-migration.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client: pg } = require("pg");

function urlDeLaBase() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  if (!m) throw new Error("Falta SUPABASE_DB_URL en el entorno y en apps/web/.env.local");
  return m[1].replace(/^"|"$/g, "");
}

const TABLAS_NUEVAS = [
  "dgii_settings","dgii_certificates","ecf_sequences","electronic_invoices",
  "electronic_invoice_items","dgii_submissions","dgii_status_logs",
  "dgii_enablement_progress","dgii_representative_attestations","received_ecf",
  "received_commercial_approvals","dgii_certification_datasets",
  "dgii_certification_cases","dgii_simulation_ranges",
  "dgii_certification_applications","dgii_certification_events",
  "dgii_certification_evidence",
];

const fallos = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const mal = (msg) => { fallos.push(msg); console.log(`  ✗ ${msg}`); };

async function main() {
  const caPath = path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt");
  const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;
  const cliente = new pg({
    connectionString: urlDeLaBase(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  });
  await cliente.connect();

  console.log("\n1) Estructura\n");
  for (const t of TABLAS_NUEVAS) {
    const r = await cliente.query("select to_regclass($1) as x", [`public.${t}`]);
    r.rows[0].x ? ok(`existe ${t}`) : mal(`FALTA la tabla ${t}`);
  }
  const sinRls = await cliente.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1) and c.relrowsecurity = false`,
    [TABLAS_NUEVAS],
  );
  sinRls.rows.length === 0
    ? ok("las 17 tienen RLS activo")
    : mal(`sin RLS: ${sinRls.rows.map((x) => x.relname).join(", ")}`);

  const legacy = await cliente.query(
    `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name like '%\\_legacy\\_20260906'`,
  );
  legacy.rows[0].n === 13
    ? ok("las 13 viejas están retiradas, no borradas")
    : mal(`se esperaban 13 tablas *_legacy_20260906 y hay ${legacy.rows[0].n}`);

  console.log("\n2) Comportamiento (todo dentro de una transacción que se deshace)\n");
  await cliente.query("begin");
  try {
    const { rows: [neg] } = await cliente.query(
      `insert into public.businesses (legal_name, commercial_name, rnc, plan_id)
       values ('VERIFICADOR FASE 2 — se deshace', 'VER-FASE-2', '00000000000', '00000000-0000-0000-0000-000000000001')
       returning id`,
    );
    const biz = neg.id;

    await cliente.query(
      `insert into public.ecf_sequences
         (business_id, tipo_ecf, ambiente, range_start, range_end, next_number, status, expires_at)
       values ($1, '32', 'testecf', 1, 3, 1, 'active', now() + interval '1 year')`,
      [biz],
    );

    const peek1 = await cliente.query("select public.peek_next_encf($1,'32','testecf') as e", [biz]);
    const peek2 = await cliente.query("select public.peek_next_encf($1,'32','testecf') as e", [biz]);
    peek1.rows[0].e === "E320000000001" && peek2.rows[0].e === peek1.rows[0].e
      ? ok("peek no consume: dos miradas seguidas dan el mismo número")
      : mal(`peek consumió algo: ${peek1.rows[0].e} luego ${peek2.rows[0].e}`);

    const r1 = await cliente.query("select public.reserve_next_encf($1,'32','testecf') as e", [biz]);
    const r2 = await cliente.query("select public.reserve_next_encf($1,'32','testecf') as e", [biz]);
    r1.rows[0].e === "E320000000001" && r2.rows[0].e === "E320000000002"
      ? ok("reserve da números consecutivos")
      : mal(`números no consecutivos: ${r1.rows[0].e}, ${r2.rows[0].e}`);

    const conflicto = await cliente.query(
      `select public.prepare_ecf_invoice($1, 'E320000000001',
         jsonb_build_object('tipo_ecf','32','ambiente','testecf','total',100),
         '[]'::jsonb) as r`,
      [biz],
    );
    conflicto.rows[0].r.motivo === "ENCF_TOMADO"
      ? ok("prepare con un número ya tomado devuelve ENCF_TOMADO sin consumir")
      : mal(`se esperaba ENCF_TOMADO y vino ${JSON.stringify(conflicto.rows[0].r)}`);

    const antes = await cliente.query(
      "select next_number from public.ecf_sequences where business_id = $1", [biz]);
    const bien = await cliente.query(
      `select public.prepare_ecf_invoice($1, 'E320000000003',
         jsonb_build_object('tipo_ecf','32','ambiente','testecf','total',100),
         jsonb_build_array(jsonb_build_object(
           'line_no',1,'name_item','Prueba','quantity',1,'unit_price',100,
           'itbis_rate',0.18,'monto_item',100))) as r`,
      [biz],
    );
    bien.rows[0].r.ok === true && bien.rows[0].r.e_ncf === "E320000000003"
      ? ok("prepare con el número correcto crea la factura y sus líneas")
      : mal(`prepare falló: ${JSON.stringify(bien.rows[0].r)}`);

    const agotada = await cliente.query(
      "select status from public.ecf_sequences where business_id = $1", [biz]);
    agotada.rows[0].status === "exhausted"
      ? ok("al gastar el último número la secuencia queda `exhausted`, no `active` mintiendo")
      : mal(`estado tras agotar: ${agotada.rows[0].status}`);

    const items = await cliente.query(
      "select count(*)::int as n from public.electronic_invoice_items where business_id = $1", [biz]);
    items.rows[0].n === 1 ? ok("la línea se guardó") : mal(`líneas guardadas: ${items.rows[0].n}`);

    const vacia = await cliente.query(
      `select public.reserve_next_encf($1,'32','testecf') as e`, [biz]).catch((e) => e);
    vacia instanceof Error && /P0002|no hay secuencia activa/.test(vacia.message)
      ? ok("sin secuencia utilizable, reserve falla en vez de inventar un número")
      : mal("reserve devolvió algo con la secuencia agotada");
  } finally {
    await cliente.query("rollback");
    console.log("\n  (transacción deshecha: no quedó ninguna fila)");
  }

  await cliente.end();
  console.log(fallos.length === 0 ? "\n✓ fase 2 verificada\n" : `\n✗ ${fallos.length} fallos\n`);
  process.exit(fallos.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("\n✗ Error:", e); process.exit(1); });
