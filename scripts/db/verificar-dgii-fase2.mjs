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

/**
 * La lista NO se copia a mano: se lee de la fuente canónica
 * (`apps/web/src/features/dgii/db/tablas.ts`). Antes era una copia literal de
 * las 17, sin nada que atara las dos; al pasar el esquema a 18 tablas
 * (`ecf_document_events`, ver C2 de la revisión final) esa copia se habría
 * quedado corta en silencio y el verificador habría dado el visto bueno a un
 * esquema incompleto. M3 de la revisión final.
 */
function tablasNuevas() {
  const ts = readFileSync(path.join(RAIZ, "apps/web/src/features/dgii/db/tablas.ts"), "utf8");
  const m = /export const TABLAS_NUEVAS = \[([\s\S]*?)\] as const;/.exec(ts);
  if (!m) throw new Error("no se pudo leer TABLAS_NUEVAS de features/dgii/db/tablas.ts");
  const nombres = [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
  if (nombres.length === 0) throw new Error("TABLAS_NUEVAS quedó vacía al leerla de tablas.ts");
  return nombres;
}

const TABLAS_NUEVAS = tablasNuevas();

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
    ? ok(`las ${TABLAS_NUEVAS.length} tienen RLS activo`)
    : mal(`sin RLS: ${sinRls.rows.map((x) => x.relname).join(", ")}`);

  const legacy = await cliente.query(
    `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_name like '%\\_legacy\\_20260906'`,
  );
  legacy.rows[0].n === 13
    ? ok("las 13 viejas están retiradas, no borradas")
    : mal(`se esperaban 13 tablas *_legacy_20260906 y hay ${legacy.rows[0].n}`);

  // ── ACL de las cinco funciones (I6 de la revisión final) ──────────────────
  // El verificador conecta como dueño de la base y ejecuta las funciones
  // directamente, así que ejercitarlas NO prueba nada sobre quién puede
  // llamarlas. Estas migraciones revocan también de `public`, a diferencia del
  // precedente de la casa (0038_web_orders.sql:120), y por eso cada `revoke`
  // lleva su `grant execute … to service_role`. La segunda aserción es la que
  // de verdad importa: sin ella, la fase 3 se estrellaría con «permission
  // denied for function» sin aviso previo.
  const FUNCS = [
    "public.reserve_next_encf(uuid,text,text)",
    "public.peek_next_encf(uuid,text,text)",
    "public.prepare_ecf_invoice(uuid,text,jsonb,jsonb)",
    "public.finalize_ecf_invoice(uuid,uuid,jsonb)",
    "public.fail_ecf_invoice(uuid,uuid,text)",
  ];
  for (const f of FUNCS) {
    const r = await cliente.query(
      `select has_function_privilege('authenticated', $1, 'execute') as auth,
              has_function_privilege('anon',          $1, 'execute') as anon,
              has_function_privilege('service_role',  $1, 'execute') as srv`,
      [f],
    );
    const { auth, anon, srv } = r.rows[0];
    !auth && !anon
      ? ok(`${f}: authenticated y anon NO pueden`)
      : mal(`${f}: llamable desde el navegador (auth=${auth} anon=${anon})`);
    srv
      ? ok(`${f}: service_role SÍ puede`)
      : mal(`${f}: service_role NO puede — la fase 3 no podrá llamarla`);
  }

  // ── Las dos claves foráneas recreadas (M3) ────────────────────────────────
  // La parte 1 las suelta y la parte 3 las vuelve a crear apuntando a la tabla
  // NUEVA. Si la parte 3 no corrió, `proformas` y `cash_closing_sales` se
  // quedan sin enganche, en silencio.
  const fks = await cliente.query(
    `select conname from pg_constraint
     where conname in ('proformas_electronic_invoice_fk','cash_closing_sales_electronic_invoice_fk')
       and confrelid = 'public.electronic_invoices'::regclass`,
  );
  fks.rows.length === 2
    ? ok("las dos claves foráneas apuntan a la electronic_invoices NUEVA")
    : mal(`FK hacia la tabla nueva: ${fks.rows.length} de 2`);

  // ── Lo que 0045 puso y agendapp nunca tuvo (C2) ───────────────────────────
  // Los índices llevan nombres NUEVOS a propósito: `alter table … rename to` no
  // renombra los índices, así que la tabla retirada conserva los de 0045 y
  // `create index if not exists` con esos nombres se saltaría en silencio,
  // dejando la tabla nueva sin barrera de idempotencia.
  const cols0045 = await cliente.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'electronic_invoices'
       and column_name = any($1)`,
    [["idempotency_key","retry_count","next_retry_at","last_error_class",
      "last_error_message","hash_sha256","rejected_at","cancelled_at"]],
  );
  cols0045.rows.length === 8
    ? ok("las ocho columnas de 0045 están en la electronic_invoices nueva")
    : mal(`columnas de 0045 presentes: ${cols0045.rows.length} de 8`);

  const idx = await cliente.query(
    `select indexname from pg_indexes
     where schemaname = 'public' and tablename = 'electronic_invoices'
       and indexname in ('idx_einv_idempotency_key','idx_einv_pendientes')`,
  );
  idx.rows.length === 2
    ? ok("la barrera de idempotencia cayó sobre la tabla NUEVA, no sobre la retirada")
    : mal(`índices de idempotencia sobre la tabla nueva: ${idx.rows.length} de 2`);

  const prepared = await cliente.query(
    `select 1 from pg_constraint
     where conrelid = 'public.electronic_invoices'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%prepared%'`,
  );
  prepared.rows.length === 1
    ? ok("el CHECK de status acepta 'prepared'")
    : mal("el CHECK de status NO acepta 'prepared': la fase 3 dejará facturas clavadas en 'signed'");

  console.log("\n2) Comportamiento (todo dentro de una transacción que se deshace)\n");

  // Verificar que existe al menos un plan antes de intentar crear un negocio de prueba
  const planes = await cliente.query("select id from public.plans limit 1");
  if (planes.rows.length === 0) {
    await cliente.end();
    mal("el verificador necesita al menos un plan en public.plans para crear su negocio de prueba");
    console.log(fallos.length === 0 ? "\n✓ fase 2 verificada\n" : `\n✗ ${fallos.length} fallos\n`);
    process.exit(1);
  }

  await cliente.query("begin");
  try {
    const { rows: [neg] } = await cliente.query(
      `insert into public.businesses (legal_name, commercial_name, rnc, plan_id)
       values ('VERIFICADOR FASE 2 — se deshace', 'VER-FASE-2', '00000000000', (select id from public.plans limit 1))
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

    // `antes` se leía y no se usaba: era la sombra de esta aserción. Que el
    // contador avance EXACTAMENTE uno es justo lo que nadie había visto correr.
    const despues = await cliente.query(
      "select next_number from public.ecf_sequences where business_id = $1", [biz]);
    const avance = Number(despues.rows[0].next_number) - Number(antes.rows[0].next_number);
    avance === 1
      ? ok("prepare avanzó next_number exactamente 1")
      : mal(`next_number avanzó ${avance} (de ${antes.rows[0].next_number} a ${despues.rows[0].next_number}), se esperaba 1`);

    const agotada = await cliente.query(
      "select status from public.ecf_sequences where business_id = $1", [biz]);
    agotada.rows[0].status === "exhausted"
      ? ok("al gastar el último número la secuencia queda `exhausted`, no `active` mintiendo")
      : mal(`estado tras agotar: ${agotada.rows[0].status}`);

    const items = await cliente.query(
      "select count(*)::int as n from public.electronic_invoice_items where business_id = $1", [biz]);
    items.rows[0].n === 1 ? ok("la línea se guardó") : mal(`líneas guardadas: ${items.rows[0].n}`);

    // finalize y fail no se ejercitaban nunca (M3 de la revisión final).
    const inv = bien.rows[0].r.invoice_id;
    const fin1 = await cliente.query(
      "select public.finalize_ecf_invoice($1,$2,jsonb_build_object('xml_signed_path','x/y.xml')) as r", [biz, inv]);
    fin1.rows[0].r.ok === true
      ? ok("finalize pasa la factura de draft a signed")
      : mal(`finalize falló: ${JSON.stringify(fin1.rows[0].r)}`);

    const fin2 = await cliente.query(
      "select public.finalize_ecf_invoice($1,$2,jsonb_build_object('xml_signed_path','x/y.xml')) as r", [biz, inv]);
    fin2.rows[0].r.motivo === "NO_ESTABA_EN_DRAFT"
      ? ok("finalize repetido dice que no, en vez de volver a firmar lo ya firmado")
      : mal(`finalize repetido devolvió ${JSON.stringify(fin2.rows[0].r)}`);

    const failAjena = await cliente.query(
      "select public.fail_ecf_invoice($1,'00000000-0000-0000-0000-000000000000'::uuid,'ajena') as r", [biz]);
    failAjena.rows[0].r.motivo === "FACTURA_NO_ENCONTRADA"
      ? ok("fail con un invoice_id que no existe NO devuelve éxito")
      : mal(`fail con invoice_id inexistente devolvió ${JSON.stringify(failAjena.rows[0].r)}`);

    const failOk = await cliente.query(
      "select public.fail_ecf_invoice($1,$2,'motivo del verificador') as r", [biz, inv]);
    failOk.rows[0].r.ok === true
      ? ok("fail deja el motivo escrito sobre la factura real")
      : mal(`fail falló: ${JSON.stringify(failOk.rows[0].r)}`);

    // C1: sin 'prepared' en el CHECK, la fase 3 no puede mover la factura.
    // Va dentro de un SAVEPOINT porque un 23514 aborta la transacción entera y
    // se llevaría por delante las comprobaciones que vienen detrás.
    await cliente.query("savepoint probar_prepared");
    const conPrepared = await cliente
      .query("update public.electronic_invoices set status = 'prepared' where id = $1", [inv])
      .catch((e) => e);
    if (conPrepared instanceof Error) {
      await cliente.query("rollback to savepoint probar_prepared");
      mal(`la base rechaza status='prepared': ${conPrepared.message}`);
    } else {
      await cliente.query("release savepoint probar_prepared");
      ok("la base acepta status='prepared', que es el único camino que sale de 'signed'");
    }

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

// Solo el mensaje, nunca el objeto entero: un error de `pg` arrastra la
// configuración de conexión, y este guion lo corre el dueño contra producción.
// `apply-migration.mjs:72` ya hacía lo correcto.
main().catch((e) => { console.error("\n✗ Error:", e.message); process.exit(1); });
