#!/usr/bin/env node
/**
 * Comprueba que `panel_ventas_unificadas` devuelve EXACTAMENTE lo mismo que
 * `resumen_ventas_unificadas` + `desglose_ventas_unificadas` por separado.
 *
 * Solo LEE. No escribe nada. Se corre DESPUÉS de aplicar la migración
 * `20260909150000_panel_ventas_unificadas.sql`:
 *
 *   node scripts/db/verificar-panel-ventas.mjs
 *
 * 🔴 Por qué existe. La función nueva no recalcula nada —llama a las otras
 * dos—, así que en teoría no PUEDE dar otro número. Esto lo comprueba contra
 * la base de verdad en vez de creerse la teoría, y de paso mide cuánto se
 * ahorra: es el motivo entero del cambio.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");

const DIMENSIONES = ["vendedor", "forma_pago", "producto", "sucursal", "mes"];

async function rpc(nombre, args) {
  const t = performance.now();
  const res = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${nombre} → ${res.status} ${texto.slice(0, 300)}`);
  return { datos: JSON.parse(texto), ms: Math.round(performance.now() - t) };
}

const [{ business_id: negocio }] = await fetch(
  `${URL_SB}/rest/v1/alegra_invoices?select=business_id&limit=1`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
).then((r) => r.json());
console.log("negocio:", negocio);

/** Los mismos periodos que abre el panel: todo, y un mes concreto. */
const CASOS = [
  { nombre: "todo el histórico", p_desde: null, p_hasta: null },
  { nombre: "septiembre 2026", p_desde: "2026-09-01", p_hasta: "2026-09-30" },
  { nombre: "un mes sin ventas", p_desde: "2019-01-01", p_hasta: "2019-01-31" },
];

let fallos = 0;
for (const caso of CASOS) {
  const base = {
    p_business_id: negocio,
    p_desde: caso.p_desde,
    p_hasta: caso.p_hasta,
    p_cliente_id: null,
    p_sucursal_id: null,
  };

  // ── Camino viejo: una llamada por cosa, en paralelo ──────────────────────
  const tViejo = performance.now();
  const [resumen, ...desgloses] = await Promise.all([
    rpc("resumen_ventas_unificadas", base),
    ...DIMENSIONES.map((d) => rpc("desglose_ventas_unificadas", { ...base, p_dimension: d })),
  ]);
  const msViejo = Math.round(performance.now() - tViejo);

  // ── Camino nuevo: una sola llamada ──────────────────────────────────────
  const nuevo = await rpc("panel_ventas_unificadas", {
    ...base,
    p_dimensiones: DIMENSIONES,
    p_con_resumen: true,
  });

  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const problemas = [];
  if (!igual(nuevo.datos.resumen, resumen.datos[0] ?? null)) problemas.push("resumen");
  DIMENSIONES.forEach((d, i) => {
    if (!igual(nuevo.datos.desgloses?.[d] ?? [], desgloses[i].datos ?? [])) problemas.push(d);
  });

  const filas = DIMENSIONES.map((d) => `${d}:${(nuevo.datos.desgloses?.[d] ?? []).length}`).join(" ");
  console.log(
    `\n${caso.nombre.padEnd(22)} ${problemas.length === 0 ? "✅ idénticos" : "🔴 DIFIEREN: " + problemas.join(", ")}`,
  );
  console.log(`  filas       ${filas}`);
  console.log(`  seis viajes ${msViejo}ms   ·   uno solo ${nuevo.ms}ms`);
  if (problemas.length > 0) fallos++;
}

console.log(fallos === 0 ? "\n✅ Todo cuadra." : `\n🔴 ${fallos} caso(s) con diferencias.`);
process.exit(fallos === 0 ? 0 : 1);
