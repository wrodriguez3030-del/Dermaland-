#!/usr/bin/env node
/**
 * Comprueba que `desglose_ventas_unificadas` quedó bien en la base REAL,
 * DESPUÉS de que el dueño aplique
 * `supabase/migrations/20260906140000_desglose_ventas_unificadas.sql`.
 *
 *   node scripts/db/apply-migration.mjs supabase/migrations/20260906140000_desglose_ventas_unificadas.sql --apply
 *   node scripts/db/verificar-desglose-ventas.mjs
 *
 * SOLO LEE. Abre una transacción `read only` que siempre termina en ROLLBACK:
 * ni una fila cambia, y si algo intentara escribir, Postgres lo impediría.
 * Mismo patrón que `scripts/db/verificar-dgii-fase2.mjs`.
 *
 * Lo que de verdad comprueba, y por qué:
 *
 *  1. Que el desglose SUMA lo mismo que el KPI (`resumen_ventas_unificadas`).
 *     Es la razón de ser de la prueba: la pantalla enseña arriba el total y
 *     abajo el desglose, y si no cuadran no hay nada que auditar. Los
 *     criterios de exclusión están duplicados en dos funciones SQL a la
 *     fuerza — nada en la base los ata.
 *  2. Que el reparto por vendedor es el REAL, el que dejó
 *     `scripts/alegra/vincular-vendedores.mjs`.
 *  3. Que `anon` NO puede ejecutarla y `authenticated` sí.
 *
 * Requiere SUPABASE_DB_URL (se lee de apps/web/.env.local si no está en el
 * entorno), igual que scripts/db/apply-migration.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(RAIZ, "apps/web/package.json"));
const { Client: pg } = require("pg");

/** El negocio de DermaLand en producción (el mismo que usa el guion de vendedores). */
const BUSINESS = process.env.DERMALAND_BUSINESS_ID ?? "00000000-0000-0000-0000-00000000d001";

function urlDeLaBase() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(path.join(RAIZ, "apps/web/.env.local"), "utf8");
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  if (!m) throw new Error("Falta SUPABASE_DB_URL en el entorno y en apps/web/.env.local");
  return m[1].replace(/^"|"$/g, "");
}

const fallos = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const mal = (msg) => {
  fallos.push(msg);
  console.log(`  ✗ ${msg}`);
};

/** Importes en pesos, con dos decimales, para poder compararlos a ojo. */
const pesos = (n) => Number(n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

async function main() {
  const caPath = path.join(RAIZ, "supabase/certs/supabase-root-2021-ca.crt");
  const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;
  const cliente = new pg({
    connectionString: urlDeLaBase(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  });
  await cliente.connect();
  // Cinturón y tirantes: `read only` hace que cualquier escritura falle, y el
  // ROLLBACK del final deshace hasta lo que no debería existir.
  await cliente.query("begin transaction read only");

  try {
    console.log("\n1) La función existe y tiene la firma del contrato\n");
    const firma = await cliente.query(
      `select pg_get_function_identity_arguments(p.oid) as args,
              p.provolatile, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'desglose_ventas_unificadas'`,
    );
    if (firma.rows.length === 0) {
      mal("FALTA la función public.desglose_ventas_unificadas — ¿se aplicó la migración?");
      throw new Error("sin función no hay nada más que comprobar");
    }
    const f = firma.rows[0];
    f.args === "p_business_id uuid, p_desde date, p_hasta date, p_cliente_id uuid, p_sucursal_id uuid, p_dimension text"
      ? ok(`firma correcta (${f.args})`)
      : mal(`firma inesperada: ${f.args}`);
    f.provolatile === "s" ? ok("es STABLE") : mal(`no es STABLE (provolatile=${f.provolatile})`);
    f.prosecdef === false
      ? ok("es SECURITY INVOKER: respeta la RLS de quien llama")
      : mal("es SECURITY DEFINER: se saltaría la RLS");
    (f.proconfig ?? []).includes("search_path=public")
      ? ok("lleva search_path fijado")
      : mal(`sin search_path fijado: ${JSON.stringify(f.proconfig)}`);

    console.log("\n2) Permisos: `anon` no, `authenticated` sí\n");
    const permisos = await cliente.query(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'desglose_ventas_unificadas'`,
    );
    const perm = permisos.rows[0];
    perm.anon === false ? ok("anon NO puede ejecutarla") : mal("anon PUEDE ejecutarla");
    perm.auth === true ? ok("authenticated puede ejecutarla") : mal("authenticated NO puede ejecutarla");

    console.log("\n3) 🔴 El desglose suma lo mismo que el KPI\n");
    const cuadre = await cliente.query(
      `with r as (select * from public.resumen_ventas_unificadas($1)),
            d as (select origen, sum(total) as total, sum(cantidad) as cantidad
                  from public.desglose_ventas_unificadas($1, null, null, null, null, 'vendedor')
                  group by origen)
       select r.sistema_total, r.sistema_cantidad, r.alegra_total, r.alegra_cantidad,
              coalesce((select total    from d where origen = 'sistema'), 0) as d_sistema_total,
              coalesce((select cantidad from d where origen = 'sistema'), 0) as d_sistema_cantidad,
              coalesce((select total    from d where origen = 'alegra'),  0) as d_alegra_total,
              coalesce((select cantidad from d where origen = 'alegra'),  0) as d_alegra_cantidad
       from r`,
      [BUSINESS],
    );
    const c = cuadre.rows[0];
    for (const [nombre, kpi, desglose] of [
      ["total del sistema", c.sistema_total, c.d_sistema_total],
      ["total de Alegra", c.alegra_total, c.d_alegra_total],
    ]) {
      Number(kpi) === Number(desglose)
        ? ok(`${nombre}: RD$${pesos(kpi)} en los dos`)
        : mal(`${nombre} DESCUADRA — KPI RD$${pesos(kpi)} vs desglose RD$${pesos(desglose)}`);
    }
    for (const [nombre, kpi, desglose] of [
      ["facturas del sistema", c.sistema_cantidad, c.d_sistema_cantidad],
      ["facturas de Alegra", c.alegra_cantidad, c.d_alegra_cantidad],
    ]) {
      Number(kpi) === Number(desglose)
        ? ok(`${nombre}: ${Number(kpi).toLocaleString("es-DO")} en los dos`)
        : mal(`${nombre} DESCUADRA — KPI ${kpi} vs desglose ${desglose}`);
    }

    console.log("\n4) Reparto por vendedor (el que dejó vincular-vendedores.mjs)\n");
    const vend = await cliente.query(
      `select etiqueta, origen, cantidad, total
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'vendedor')`,
      [BUSINESS],
    );
    for (const r of vend.rows) {
      console.log(`    ${r.origen.padEnd(8)} ${String(r.etiqueta).padEnd(20)} ${String(r.cantidad).padStart(6)}  RD$${pesos(r.total)}`);
    }
    vend.rows.some((r) => r.origen === "alegra")
      ? ok("el histórico migrado SÍ aparece desglosado por vendedor")
      : mal("ni una fila de Alegra: el desglose sigue enseñando solo el sistema");

    console.log("\n5) Forma de pago — el dato migrado, sin maquillar\n");
    const pago = await cliente.query(
      `select etiqueta, cantidad, total
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'forma_pago')`,
      [BUSINESS],
    );
    for (const r of pago.rows) {
      console.log(`    ${String(r.etiqueta).padEnd(24)} ${String(r.cantidad).padStart(6)}  RD$${pesos(r.total)}`);
    }
    const sinPago = pago.rows.find((r) => r.etiqueta === "Sin forma de pago");
    if (sinPago) {
      console.log(
        `\n    ℹ Alegra no registró la forma de pago en ${Number(sinPago.cantidad).toLocaleString("es-DO")} facturas.`,
      );
      console.log("      Es el dato tal como vino de la migración, no un fallo del desglose.");
    }

    console.log("\n6) Producto — los renglones del histórico\n");
    const prod = await cliente.query(
      `select count(*)::int as filas, sum(cantidad)::int as renglones, sum(total) as total
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'producto')`,
      [BUSINESS],
    );
    const p = prod.rows[0];
    console.log(`    ${p.filas} productos · ${p.renglones} renglones · RD$${pesos(p.total)}`);
    p.filas <= 200
      ? ok(`el tope de 200 filas se respeta (${p.filas})`)
      : mal(`devolvió ${p.filas} filas: el tope de 200 no se está aplicando`);

    console.log("\n7) Una dimensión desconocida no devuelve filas de otra\n");
    const bogus = await cliente.query(
      `select count(*)::int as n from public.desglose_ventas_unificadas($1, null, null, null, null, 'inventada')`,
      [BUSINESS],
    );
    bogus.rows[0].n === 0
      ? ok("una dimensión inventada devuelve cero filas")
      : mal(`una dimensión inventada devolvió ${bogus.rows[0].n} filas`);
  } finally {
    await cliente.query("rollback");
    await cliente.end();
  }

  console.log("");
  if (fallos.length) {
    console.log(`✗ ${fallos.length} comprobación(es) fallaron:\n`);
    for (const f of fallos) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("✓ Todo en orden.\n");
  }
}

main().catch((e) => {
  console.error("\n✗ Error:", e.message, "\n");
  process.exitCode = 1;
});
