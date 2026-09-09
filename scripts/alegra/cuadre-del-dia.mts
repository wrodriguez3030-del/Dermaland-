#!/usr/bin/env -S npx tsx
/**
 * ¿Cuadra DermaLand con lo que Alegra dice de un día?
 *
 * Compara FACTURA POR FACTURA, no solo el total: dos totales iguales pueden
 * esconder una factura de más y otra de menos. Dice cuáles faltan, cuáles
 * sobran y cuáles tienen otro importe.
 *
 * Solo LEE de los dos lados. No escribe nada, ni siquiera el registro de la
 * corrida — para eso está `alegra-sync.mts`.
 *
 *   T="apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json"
 *   $T scripts/alegra/cuadre-del-dia.mts              # hoy
 *   $T scripts/alegra/cuadre-del-dia.mts 2026-09-07   # otro día
 *
 * 🔴 Pregunta por los TRES estados (cerrada, abierta y anulada). Pedir solo
 * las cerradas daría un cuadre en verde con las anuladas fuera de la cuenta,
 * que es precisamente el descuadre que nadie ve.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AlegraClient } from "../../apps/web/src/server/services/alegra/client";
import { loadEnv, makeRest } from "../lib/supabase-rest.mts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * El día a cuadrar. Por defecto HOY en Santo Domingo — no en UTC: a partir de
 * las 8 de la noche de la clínica, UTC ya va por el día siguiente y el cuadre
 * se haría contra un día sin ventas.
 */
const HOY =
  process.argv[2] ??
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const NEGOCIO = "00000000-0000-0000-0000-00000000d001";

const env = loadEnv(ROOT);
const rest = makeRest(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const alegra = new AlegraClient({ email: env.ALEGRA_EMAIL!, token: env.ALEGRA_TOKEN! });

// ── Alegra ────────────────────────────────────────────────────────────────
// Las tres vistas que usa la sincronización: una factura puede estar cerrada,
// abierta o anulada, y pedir solo una dejaría fuera las otras dos.
const deAlegra: Array<Record<string, unknown>> = [];
const vistas = new Set<string>();
for (const q of [{ status: "closed", date: HOY }, { status: "open", date: HOY }, { status: "void", date: HOY }]) {
  const page = await alegra.listAll<Record<string, unknown>>("invoices", q);
  for (const f of page) {
    if (vistas.has(String(f.id))) continue;
    vistas.add(String(f.id));
    deAlegra.push(f);
  }
}
const enAlegra = new Map<string, { numero: string; total: number; estado: string }>();
for (const f of deAlegra) {
  if (String(f.date).slice(0, 10) !== HOY) continue;
  const plantilla = f.numberTemplate as { fullNumber?: string } | undefined;
  enAlegra.set(String(f.id), {
    numero: String(plantilla?.fullNumber ?? f.number ?? f.id),
    total: Number(f.total ?? 0),
    estado: String(f.status ?? ""),
  });
}

// ── DermaLand ─────────────────────────────────────────────────────────────
const filas = await rest.getAll<{ alegra_id: string; ncf: string; total: number; status: string }>(
  `alegra_invoices?select=alegra_id,ncf,total,status&business_id=eq.${NEGOCIO}&date=eq.${HOY}`,
);
const enDerma = new Map(filas.map((f) => [String(f.alegra_id), f]));

// ── Comparación ───────────────────────────────────────────────────────────
const faltan = [...enAlegra.keys()].filter((id) => !enDerma.has(id));
const sobran = [...enDerma.keys()].filter((id) => !enAlegra.has(id));
const difieren: string[] = [];
for (const [id, a] of enAlegra) {
  const d = enDerma.get(id);
  if (!d) continue;
  if (Math.abs(Number(d.total) - a.total) > 0.005) {
    difieren.push(`${a.numero}: Alegra ${a.total} · DermaLand ${d.total}`);
  }
}
const suma = (n: number[]) => n.reduce((s, x) => s + x, 0);
const tA = suma([...enAlegra.values()].map((v) => v.total));
const tD = suma(filas.map((f) => Number(f.total)));

console.log(`\nVentas del ${HOY}\n`);
console.log(`  Alegra      ${String(enAlegra.size).padStart(4)} facturas   RD$${tA.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`);
console.log(`  DermaLand   ${String(enDerma.size).padStart(4)} facturas   RD$${tD.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`);
console.log(`  Diferencia  ${(enAlegra.size - enDerma.size >= 0 ? " " : "")}${enAlegra.size - enDerma.size} facturas   RD$${(tA - tD).toFixed(2)}\n`);
if (faltan.length) console.log(`🔴 En Alegra y NO en DermaLand (${faltan.length}):`, faltan.map((i) => enAlegra.get(i)!.numero).join(", "));
if (sobran.length) console.log(`🔴 En DermaLand y NO en Alegra (${sobran.length}):`, sobran.map((i) => enDerma.get(i)!.ncf).join(", "));
if (difieren.length) console.log(`🔴 Totales que no coinciden:\n   ${difieren.join("\n   ")}`);
if (!faltan.length && !sobran.length && !difieren.length) console.log("✅ Cuadran factura por factura.");
