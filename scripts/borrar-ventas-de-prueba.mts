#!/usr/bin/env -S npx tsx
/**
 * Borra las ventas y pedidos web DE PRUEBA de DermaLand.
 *
 * Una venta es de prueba cuando el nombre del cliente coincide con uno de los
 * nombres del dueño y su equipo (`NOMBRES_DE_PRUEBA`). El dueño los usa para
 * probar el POS y la tienda, y no quiere que se mezclen con las ventas reales
 * (2026-09-05: las 52 que existían eran todas suyas, con su propio teléfono).
 *
 * Reglas de seguridad:
 *  - DRY-RUN por defecto. Sin `--apply` no borra nada.
 *  - `business_id` es constante del código.
 *  - Borra en orden de dependencias (hijos antes que padres).
 *  - `--hasta=YYYY-MM-DD` acota por fecha (por defecto, todo).
 *  - `--todas` ignora el filtro de nombres y borra TODAS las ventas del rango.
 *    Exige `--hasta` a propósito: sirve para la limpieza única de «todo lo
 *    anterior a la migración», no para vaciar la tabla de un manotazo.
 *  - NUNCA toca `alegra_invoices`: ese es el historial de Alegra, no ventas de
 *    DermaLand.
 *  - Lo que NO se deshace: los contadores de comprobantes (`invoice_numberings`)
 *    se quedan donde están. Un NCF consumido no se reutiliza jamás.
 *
 * Uso:
 *   T="apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json"
 *   $T scripts/borrar-ventas-de-prueba.mts                      # simula
 *   $T scripts/borrar-ventas-de-prueba.mts --apply              # borra
 *   $T scripts/borrar-ventas-de-prueba.mts --apply --hasta=2026-09-05
 *   $T scripts/borrar-ventas-de-prueba.mts --apply --con-cajas  # + sesiones de caja
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, makeRest } from "./lib/supabase-rest.mts";
import { BUSINESS_ID, B } from "./lib/stock-apply.mts";
import { esVentaDePrueba } from "../apps/web/src/features/sales/test-sales.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const CON_CAJAS = args.includes("--con-cajas");
const HASTA = args.find((a) => a.startsWith("--hasta="))?.split("=")[1];
const TODAS = args.includes("--todas");
if (TODAS && !HASTA) {
  console.error("--todas exige --hasta=YYYY-MM-DD: no se borra sin acotar la fecha.");
  process.exit(1);
}

const env = loadEnv(ROOT);
const rest = makeRest(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

interface Proforma {
  id: string;
  number: string;
  customer_name: string | null;
  total: number | string;
  created_at: string;
  ecf_number: string | null;
}
interface PedidoWeb {
  id: string;
  number: string;
  contact_name: string | null;
  total: number | string;
  created_at: string;
}

const enRango = (fecha: string): boolean => !HASTA || fecha.slice(0, 10) <= HASTA;

async function borrar(tabla: string, filtro: string, cuantas: number, etiqueta: string): Promise<void> {
  if (cuantas === 0) return;
  if (!APPLY) {
    console.log(`   (simulado) ${etiqueta}: ${cuantas}`);
    return;
  }
  await rest.delete(tabla, filtro);
  console.log(`   ✓ ${etiqueta}: ${cuantas}`);
}

const enLista = (ids: string[]): string => `id=in.(${ids.join(",")})`;

async function main(): Promise<void> {
  console.log(
    `\n${APPLY ? "⚠️  MODO BORRAR" : "🔍 SIMULACIÓN (dry-run)"}${HASTA ? ` · hasta ${HASTA}` : " · todas las fechas"}${TODAS ? " · TODAS (sin filtrar por nombre)" : " · solo las de prueba por nombre"}\n`,
  );

  const proformas = await rest.getAll<Proforma>(
    `proformas?select=id,number,customer_name,total,created_at,ecf_number&${B}`,
  );
  const pedidos = await rest.getAll<PedidoWeb>(
    `web_orders?select=id,number,contact_name,total,created_at&${B}`,
  );

  const dePrueba = (nombre: string | null): boolean => TODAS || esVentaDePrueba(nombre);
  const pPrueba = proformas.filter((p) => dePrueba(p.customer_name) && enRango(p.created_at));
  const oPrueba = pedidos.filter((o) => dePrueba(o.contact_name) && enRango(o.created_at));
  const pReales = proformas.length - pPrueba.length;
  const oReales = pedidos.length - oPrueba.length;

  const monto = (xs: Array<{ total: number | string }>): string =>
    xs.reduce((a, x) => a + (Number(x.total) || 0), 0).toLocaleString("es-DO");

  console.log(`Facturas/proformas: ${pPrueba.length} de prueba (RD$${monto(pPrueba)}) · ${pReales} reales se quedan`);
  console.log(`Pedidos web: ${oPrueba.length} de prueba (RD$${monto(oPrueba)}) · ${oReales} reales se quedan`);
  console.log(`  con NCF consumido: ${pPrueba.filter((p) => p.ecf_number).length} (el contador NO se rebobina)`);
  if (pPrueba.length === 0 && oPrueba.length === 0) {
    console.log("\nNada que borrar.\n");
    return;
  }

  const pIds = pPrueba.map((p) => p.id);
  const oIds = oPrueba.map((o) => o.id);

  console.log("\nBorrando en orden de dependencias:");
  if (oIds.length > 0) {
    const lineas = await rest.getAll<{ id: string }>(
      `web_order_items?select=id&${B}&order_id=in.(${oIds.join(",")})`,
    );
    await borrar("web_order_items", `order_id=in.(${oIds.join(",")})&${B}`, lineas.length, "líneas de pedido web");
  }
  if (pIds.length > 0) {
    const [items, pagos, movs, incentivos] = await Promise.all([
      rest.getAll<{ id: string }>(`proforma_items?select=id&${B}&proforma_id=in.(${pIds.join(",")})`),
      rest.getAll<{ id: string }>(`proforma_payments?select=id&${B}&proforma_id=in.(${pIds.join(",")})`),
      rest.getAll<{ id: string }>(`inventory_movements?select=id&${B}&proforma_id=in.(${pIds.join(",")})`),
      rest.getAll<{ id: string }>(`sales_incentives?select=id&${B}&sale_id=in.(${pIds.join(",")})`),
    ]);
    await borrar("sales_incentives", `sale_id=in.(${pIds.join(",")})&${B}`, incentivos.length, "incentivos de venta");
    await borrar("inventory_movements", `proforma_id=in.(${pIds.join(",")})&${B}`, movs.length, "movimientos de inventario");
    await borrar("proforma_payments", `proforma_id=in.(${pIds.join(",")})&${B}`, pagos.length, "pagos");
    await borrar("proforma_items", `proforma_id=in.(${pIds.join(",")})&${B}`, items.length, "líneas de factura");
  }
  // Los pedidos apuntan a la proforma: se sueltan antes de borrarla.
  if (oIds.length > 0) {
    if (APPLY) await rest.patch("web_orders", `${enLista(oIds)}&${B}`, { proforma_id: null });
    await borrar("web_orders", `${enLista(oIds)}&${B}`, oIds.length, "pedidos web");
  }
  if (pIds.length > 0) {
    await borrar("proformas", `${enLista(pIds)}&${B}`, pIds.length, "facturas y proformas");
  }
  if (CON_CAJAS) {
    const cajas = await rest.getAll<{ id: string }>(`cash_register_sessions?select=id&${B}`);
    await borrar("cash_register_sessions", B, cajas.length, "sesiones de caja");
  }

  if (APPLY) {
    const quedanP = await rest.getAll<Proforma>(`proformas?select=id,customer_name&${B}`);
    const quedanO = await rest.getAll<PedidoWeb>(`web_orders?select=id,contact_name&${B}`);
    const sobranP = quedanP.filter((p) => esVentaDePrueba(p.customer_name)).length;
    const sobranO = quedanO.filter((o) => esVentaDePrueba(o.contact_name)).length;
    console.log(
      `\nVerificación: quedan ${quedanP.length} facturas y ${quedanO.length} pedidos · de prueba sin borrar: ${sobranP + sobranO}`,
    );
  }
  console.log(APPLY ? "\n✓ listo\n" : "\nSimulación. Para borrar de verdad: --apply\n");
}

main().catch((e) => {
  console.error("\n✗ Error:", e);
  process.exit(1);
});
