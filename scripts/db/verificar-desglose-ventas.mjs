#!/usr/bin/env node
/**
 * Comprueba que `desglose_ventas_unificadas` quedó bien en la base REAL,
 * DESPUÉS de que el dueño aplique sus migraciones. Son DOS, en este orden: la
 * que estrenó la función y la que le añade las dimensiones `sucursal` y `mes`
 * —las dos tarjetas del panel que salían en blanco— reemplazándola con un
 * `create or replace` sobre la misma firma.
 *
 *   node scripts/db/apply-migration.mjs supabase/migrations/20260906140000_desglose_ventas_unificadas.sql --apply
 *   node scripts/db/apply-migration.mjs supabase/migrations/20260907120000_desglose_ventas_sucursal_mes.sql --apply
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
 *  2. Que ninguna factura se cuenta dos veces: el desglose por vendedor busca
 *     al usuario con un `left join lateral`, y sin su `limit 1` dos usuarios
 *     con el nombre parecido duplicarían cada factura no enlazada.
 *  3. Que ningún vendedor sale partido en dos filas, y en qué estado está el
 *     enlace `seller_id` (que el sincronizador diario no rellena).
 *  4. Que el reparto por vendedor es el REAL, el que dejó
 *     `scripts/alegra/vincular-vendedores.mjs`.
 *  5. Que `anon` NO puede ejecutarla y `authenticated` sí.
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

    console.log("\n3 bis) 🔴 Ninguna factura se cuenta dos veces\n");
    // El `left join lateral` del desglose por vendedor busca al usuario primero
    // por `seller_id` y, si falta, por nombre normalizado. Sin su `limit 1`,
    // dos usuarios cuyo nombre normalice igual devolverían DOS filas por
    // factura y el desglose contaría el dinero dos veces. Aquí se mide.
    const facturas = await cliente.query(
      `select count(*)::int as n, coalesce(sum(total), 0) as total
       from public.alegra_invoices
       where business_id = $1 and status not in ('void', 'draft')`,
      [BUSINESS],
    );
    const fac = facturas.rows[0];
    Number(c.d_alegra_cantidad) === Number(fac.n)
      ? ok(`${Number(fac.n).toLocaleString("es-DO")} facturas, ${Number(fac.n).toLocaleString("es-DO")} contadas`)
      : mal(`el desglose cuenta ${c.d_alegra_cantidad} facturas y hay ${fac.n}: se está duplicando o perdiendo`);

    console.log("\n3 ter) En qué estado está el enlace de vendedores\n");
    // La columna la crea 20260906120000 y la rellena vincular-vendedores.mjs.
    // Entre una cosa y otra, y con cada factura nueva del sincronizador, hay
    // facturas SIN enlazar: el desglose tiene que seguir juntándolas con las de
    // su misma persona, no abrirles una fila aparte.
    const enlace = await cliente.query(
      `select count(*) filter (where seller_id is not null)::int as enlazadas,
              count(*) filter (where seller_id is null)::int     as sueltas
       from public.alegra_invoices
       where business_id = $1 and status not in ('void', 'draft')`,
      [BUSINESS],
    );
    const e = enlace.rows[0];
    console.log(`    ${Number(e.enlazadas).toLocaleString("es-DO")} con seller_id · ${Number(e.sueltas).toLocaleString("es-DO")} sin enlazar`);
    if (e.enlazadas === 0) {
      console.log("    ℹ Todavía no se ha corrido scripts/alegra/vincular-vendedores.mjs --apply.");
      console.log("      El desglose agrupa por nombre NORMALIZADO; el reparto es correcto,");
      console.log("      pero las etiquetas son el texto de Alegra («LAURA MEJIA»), no el nombre real.");
    }
    // Nadie puede salir dos veces con el mismo nombre visible: eso sería la
    // persona partida en dos filas, que es lo que este arreglo cierra.
    const repetidos = await cliente.query(
      `select etiqueta, count(*)::int as veces
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'vendedor')
       where origen = 'alegra'
       group by etiqueta having count(*) > 1`,
      [BUSINESS],
    );
    repetidos.rows.length === 0
      ? ok("ningún vendedor sale dos veces en el desglose")
      : mal(`vendedores partidos en dos filas: ${repetidos.rows.map((r) => `${r.etiqueta} (${r.veces})`).join(", ")}`);

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

    console.log("\n6 bis) Sucursal — el histórico repartido por sede\n");
    // La tarjeta «Ventas por sucursal» del panel salía EN BLANCO («Sin datos
    // este mes.») porque sólo miraba `proformas`, que tiene 0 filas.
    const suc = await cliente.query(
      `select etiqueta, cantidad, total
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'sucursal')`,
      [BUSINESS],
    );
    for (const r of suc.rows) {
      console.log(`    ${String(r.etiqueta).padEnd(24)} ${String(r.cantidad).padStart(6)}  RD$${pesos(r.total)}`);
    }
    suc.rows.length > 0
      ? ok(`${suc.rows.length} sucursal(es) en el desglose`)
      : mal("ni una fila: la tarjeta «Ventas por sucursal» seguiría en blanco");
    // 🔴 El reparto por sucursal suma cabeceras de factura, igual que el de
    // vendedor: tiene que dar EXACTAMENTE el mismo total que el KPI. Si no,
    // el panel enseñaría arriba un número y abajo otro.
    const sumaSuc = suc.rows.reduce((s, r) => s + Number(r.total), 0);
    Math.abs(sumaSuc - Number(c.alegra_total)) < 0.005
      ? ok(`el desglose por sucursal cuadra con el KPI: RD$${pesos(sumaSuc)}`)
      : mal(`sucursal DESCUADRA — KPI RD$${pesos(c.alegra_total)} vs sucursal RD$${pesos(sumaSuc)}`);
    // Un UUID de etiqueta significa que el join a `branches` no encontró la
    // sede: el dueño vería un identificador donde espera «Villa Olga».
    const uuidSuelto = suc.rows.filter((r) => /^[0-9a-f-]{36}$/i.test(String(r.etiqueta)));
    uuidSuelto.length === 0
      ? ok("todas las sucursales salen con su nombre, ninguna con un UUID")
      : mal(`sucursales sin nombre: ${uuidSuelto.map((r) => r.etiqueta).join(", ")}`);

    console.log("\n6 ter) Mes — la serie de tiempo de la tendencia\n");
    // La gráfica «Tendencia mensual (ventas)» dibujaba una línea plana en cero.
    const mes = await cliente.query(
      `select clave, etiqueta, cantidad, total
       from public.desglose_ventas_unificadas($1, null, null, null, null, 'mes')
       order by clave`,
      [BUSINESS],
    );
    for (const r of mes.rows.slice(-8)) {
      console.log(`    ${r.clave}  ${String(r.etiqueta).padEnd(10)} ${String(r.cantidad).padStart(6)}  RD$${pesos(r.total)}`);
    }
    // 🔴 La clave tiene que ser 'YYYY-MM': es lo que casa cada mes con su cubo
    // en el navegador (`mesesDeLaTendencia`). Si saliera «Sep 2026», el
    // histórico no encontraría su punto y la línea seguiría plana.
    const clavesMalas = mes.rows.filter((r) => !/^\d{4}-\d{2}$/.test(String(r.clave)));
    clavesMalas.length === 0
      ? ok(`${mes.rows.length} meses, todos con clave 'YYYY-MM'`)
      : mal(`claves de mes con formato inesperado: ${clavesMalas.map((r) => r.clave).join(", ")}`);
    // Ordenadas como TEXTO tienen que quedar en orden cronológico.
    const claves = mes.rows.map((r) => String(r.clave));
    JSON.stringify(claves) === JSON.stringify([...claves].sort())
      ? ok("las claves de mes ordenan cronológicamente como texto")
      : mal("las claves de mes NO ordenan cronológicamente");
    // Y la serie entera suma lo mismo que el KPI: son cabeceras de factura.
    const sumaMes = mes.rows.reduce((s, r) => s + Number(r.total), 0);
    Math.abs(sumaMes - Number(c.alegra_total)) < 0.005
      ? ok(`la serie mensual cuadra con el KPI: RD$${pesos(sumaMes)}`)
      : mal(`la serie mensual DESCUADRA — KPI RD$${pesos(c.alegra_total)} vs meses RD$${pesos(sumaMes)}`);
    // Las etiquetas van en español y abreviadas, las mismas de `MONTHS_ES`.
    const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const etiquetasMalas = mes.rows.filter((r) => {
      const m = /^([A-Za-z]{3}) (\d{4})$/.exec(String(r.etiqueta));
      return !m || MESES_ES[Number(String(r.clave).slice(5)) - 1] !== m[1];
    });
    etiquetasMalas.length === 0
      ? ok("las etiquetas de mes son las de la casa (Ene…Dic) y casan con su clave")
      : mal(`etiquetas de mes inesperadas: ${etiquetasMalas.map((r) => `${r.clave}→${r.etiqueta}`).join(", ")}`);

    console.log("\n6 quater) El filtro de fechas recorta de verdad la serie\n");
    // El panel pide SIEMPRE una ventana de 6 meses para la tendencia: si el
    // filtro no recortara, se traería el histórico entero.
    const ventana = await cliente.query(
      `select count(*)::int as n from public.desglose_ventas_unificadas($1, $2, $3, null, null, 'mes')`,
      [BUSINESS, "2026-04-01", "2026-09-30"],
    );
    ventana.rows[0].n <= 6
      ? ok(`una ventana de 6 meses devuelve ${ventana.rows[0].n} filas, no el histórico entero`)
      : mal(`la ventana de 6 meses devolvió ${ventana.rows[0].n} filas: el filtro de fechas no recorta`);

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
