#!/usr/bin/env -S npx tsx
/**
 * Sincronizador Alegra → DermaLand.
 *
 * Alegra manda; aquí SOLO se lee de Alegra y se escribe en DermaLand.
 * Spec: docs/superpowers/specs/2026-09-05-alegra-sync-design.md
 *
 * Orden: contactos (clientes y proveedores) → ítems (catálogo) → stock →
 * facturas → registro de la corrida. Un fallo en una entidad se anota y NO
 * detiene las demás; un 401 aborta todo sin desactivar nada.
 *
 * Uso (el `--tsconfig` es OBLIGATORIO: sin él tsx no resuelve los imports `@/`
 * de los módulos de la app, y el script muere con MODULE_NOT_FOUND):
 *
 *   T="apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json"
 *   $T scripts/alegra-sync.mts                        # dry-run incremental
 *   $T scripts/alegra-sync.mts --apply                # escribe
 *   $T scripts/alegra-sync.mts --apply --full         # carga inicial completa
 *   $T scripts/alegra-sync.mts --entities=contacts,items,stock,invoices
 *   $T scripts/alegra-sync.mts --since=2026-09-01     # facturas desde esa fecha
 *   $T scripts/alegra-sync.mts --trigger=cron|manual|cli
 *
 * Salida: consola + backups/alegra-sync-<stamp>/ + fila en `alegra_sync_runs`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlegraAuthError,
  AlegraClient,
} from "../apps/web/src/server/services/alegra/client";
import type { AlegraContact, AlegraInvoice, AlegraItem } from "../apps/web/src/features/alegra/types";
import { planContacts, type ContactAction, type ExistingClient } from "../apps/web/src/features/alegra/plan-contacts";
import { contactToSupplierDraft, isProvider, type ClientDraft } from "../apps/web/src/features/alegra/map-contact";
import { planProducts, type ExistingProduct } from "../apps/web/src/features/alegra/plan-products";
import { stockRowsFromItems } from "../apps/web/src/features/alegra/stock-rows";
import { invoiceToRows } from "../apps/web/src/features/alegra/map-invoice";
import { resolverVendedor, normalizarNombre } from "./lib/vendedor-de-factura.mjs";
import { buildImportPlan } from "../apps/web/src/features/inventory/alegra-import";
import { normalizeDocument } from "../apps/web/src/features/customers/customer-normalization";
import { nextSkuAfter, nextSkuFromSkus } from "../apps/web/src/features/products/product-sku";
import { parseProductName } from "../apps/web/src/lib/import/product-parser";
import { loadEnv, makeRest } from "./lib/supabase-rest.mts";
import { B, BUSINESS_ID, aplicarPlan, fuentesPlan, loadDb, verificar } from "./lib/stock-apply.mts";

// ─── Constantes ───────────────────────────────────────────────────────────
const OWNER_USER_ID = "2f707d5c-65c2-4388-b2b9-592693414b9f"; // Dario (admin)
const USER_NAME = "Sincronizador Alegra";
const LOTE_ESCRITURA = 200;
/** categoryId del parser → nombre real en `product_categories`. */
const CATEGORIA_POR_PARSER: Record<string, string> = {
  cat_solar: "Protección solar",
  cat_facial: "Cuidado facial",
  cat_acne: "Acné y piel grasa",
  cat_capilar: "Capilar / Tricología",
  cat_pediatria: "Pediatría dermatológica",
  cat_atopica: "Piel atópica / sensible",
  cat_corporal: "Cuidado corporal",
  cat_oral: "Suplementos orales",
};

// ─── Argumentos ───────────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const APPLY = flag("apply");
const FULL = flag("full");
const ENTITIES = new Set((opt("entities") ?? "contacts,items,stock,invoices").split(","));
const TRIGGER = (opt("trigger") ?? "cli") as "cron" | "manual" | "cli";
const SINCE = opt("since");

const env = loadEnv(ROOT);
const rest = makeRest(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
if (!env.ALEGRA_EMAIL || !env.ALEGRA_TOKEN) {
  throw new Error("Faltan ALEGRA_EMAIL / ALEGRA_TOKEN (apps/web/.env.local o secretos del workflow)");
}
const alegra = new AlegraClient({ email: env.ALEGRA_EMAIL, token: env.ALEGRA_TOKEN });

// ─── Utilidades ───────────────────────────────────────────────────────────
const pad = (n: number): string => String(n).padStart(2, "0");
const ahora = new Date();
const stamp = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}-${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}`;
const reference = `ALEGRA-SYNC-${stamp}`;
const OUT_DIR = path.join(ROOT, "backups", `alegra-sync-${stamp}`);
const todayRD = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
function diasAtras(n: number): string {
  const d = new Date(`${todayRD()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function trozos<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function escribirReporte(name: string, data: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
}

type Counts = Record<string, Record<string, number>>;
const counts: Counts = {};
const errors: Array<{ entity: string; message: string }> = [];
let abortar = false;
function bump(entity: string, k: string, n = 1): void {
  counts[entity] = counts[entity] ?? {};
  counts[entity]![k] = (counts[entity]![k] ?? 0) + n;
}
function fail(entity: string, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  errors.push({ entity, message });
  console.error(`  ✗ ${entity}: ${message}`);
  if (e instanceof AlegraAuthError) abortar = true;
}

// ─── Corrida ──────────────────────────────────────────────────────────────
async function abrirCorrida(): Promise<string | null> {
  try {
    const r = await rest.insert<{ id: string }>("alegra_sync_runs", {
      business_id: BUSINESS_ID,
      trigger: TRIGGER,
      mode: FULL ? "full" : "incremental",
      dry_run: !APPLY,
      reference,
      log_url:
        process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : null,
    });
    return r.id;
  } catch (e) {
    fail("run", e);
    return null;
  }
}

async function cerrarCorrida(id: string | null): Promise<never> {
  const ok = errors.length === 0;
  escribirReporte("reporte.json", { apply: APPLY, full: FULL, reference, counts, errors, requests: alegra.requests });
  console.log(
    `\n${ok ? "✓" : "✗"} corrida ${APPLY ? "aplicada" : "simulada"} · ${alegra.requests} peticiones a Alegra · errores ${errors.length} · reporte en ${OUT_DIR}`,
  );
  if (id) {
    try {
      await rest.patch("alegra_sync_runs", `id=eq.${id}`, {
        finished_at: new Date().toISOString(),
        ok,
        counts,
        errors,
      });
    } catch (e) {
      console.error("  ✗ no se pudo cerrar la corrida:", (e as Error).message);
    }
  }
  process.exit(ok ? 0 : 1);
}

// ─── Clientes ─────────────────────────────────────────────────────────────
function numeroClienteLibre(usados: Set<string>): string {
  for (;;) {
    const n = `CLI-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!usados.has(n)) {
      usados.add(n);
      return n;
    }
  }
}

function filaCliente(d: ClientDraft, customerNumber: string): Record<string, unknown> {
  return {
    business_id: BUSINESS_ID,
    customer_number: customerNumber,
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    whatsapp: d.whatsapp,
    email: d.email,
    document_type: d.documentType,
    document_number: d.documentNumber,
    source: "alegra",
    alegra_id: d.alegraId,
    tags: d.active ? [] : ["alegra-inactivo"],
  };
}

function camposCliente(fill: ContactAction extends { fill: infer F } ? F : never): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const f = fill as Record<string, unknown>;
  for (const [clave, columna] of [
    ["phone", "phone"],
    ["whatsapp", "whatsapp"],
    ["email", "email"],
    ["documentType", "document_type"],
    ["documentNumber", "document_number"],
  ] as const) {
    if (f[clave] !== undefined) out[columna] = f[clave];
  }
  return out;
}

async function sincronizarContactos(contactos: AlegraContact[]): Promise<void> {
  const existentes = await rest.getAll<Record<string, unknown>>(
    `clients?select=id,first_name,last_name,phone,email,document_number,phone_digits,whatsapp_digits,email_normalized,alegra_id,customer_number,created_at&${B}&deleted_at=is.null`,
  );
  const existing: ExistingClient[] = existentes.map((r) => ({
    id: String(r.id),
    firstName: (r.first_name as string) ?? null,
    lastName: (r.last_name as string) ?? null,
    phoneDigits: (r.phone_digits as string) ?? null,
    whatsappDigits: (r.whatsapp_digits as string) ?? null,
    emailNormalized: (r.email_normalized as string) ?? null,
    createdAt: String(r.created_at),
    alegraId: (r.alegra_id as string) ?? null,
    alegraUpdatedAt: null,
    documentNormalized: r.document_number ? normalizeDocument(String(r.document_number)) : null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    documentNumber: (r.document_number as string) ?? null,
  }));

  const acciones = planContacts(contactos, existing);
  for (const a of acciones) bump("contacts", a.kind);
  const crear = acciones.filter((a): a is Extract<ContactAction, { kind: "create" }> => a.kind === "create");
  // Solo se escribe si hay algo que cambiar: enlazar una ficha que YA tiene su
  // alegra_id y nada que rellenar no justifica un PATCH (serían miles al día).
  const enlazar = acciones.filter(
    (a): a is Extract<ContactAction, { kind: "link" }> =>
      a.kind === "link" && (a.reason !== "alegra_id" || Object.keys(a.fill).length > 0),
  );
  bump("contacts", "toWrite", crear.length + enlazar.length);
  console.log(
    `Contactos: ${contactos.length} leídos · crear ${crear.length} · enlazar/actualizar ${enlazar.length} · sin cambios ${(counts.contacts?.skip ?? 0) + ((counts.contacts?.link ?? 0) - enlazar.length)}`,
  );
  if (!APPLY) return;

  const usados = new Set(existentes.map((r) => String(r.customer_number)));
  for (const lote of trozos(crear, LOTE_ESCRITURA)) {
    const filas = lote.map((a) => filaCliente(a.draft, numeroClienteLibre(usados)));
    try {
      await rest.insertMany("clients", filas);
      bump("contacts", "created", filas.length);
    } catch {
      // Un choque de `customer_number` tumba el lote entero: reintentar fila a fila.
      for (const fila of filas) {
        try {
          await rest.insert("clients", { ...fila, customer_number: numeroClienteLibre(usados) });
          bump("contacts", "created");
        } catch (e2) {
          fail("contacts", e2);
        }
      }
    }
  }
  for (const a of enlazar) {
    try {
      await rest.patch("clients", `id=eq.${a.clientId}&${B}`, {
        alegra_id: a.draft.alegraId,
        ...camposCliente(a.fill),
        updated_at: new Date().toISOString(),
      });
      bump("contacts", "linked");
    } catch (e) {
      fail("contacts", e);
    }
  }
}

async function sincronizarProveedores(contactos: AlegraContact[]): Promise<void> {
  const proveedores = contactos.filter(isProvider).map(contactToSupplierDraft);
  bump("suppliers", "read", proveedores.length);
  if (!APPLY || proveedores.length === 0) return;
  const actuales = await rest.getAll<{ id: string; name: string; rnc: string | null; alegra_id: string | null }>(
    `suppliers?select=id,name,rnc,alegra_id&${B}&deleted_at=is.null`,
  );
  for (const p of proveedores) {
    const ya =
      actuales.find((s) => s.alegra_id === p.alegraId) ??
      actuales.find(
        (s) => !s.alegra_id && ((p.rnc && s.rnc === p.rnc) || s.name.trim().toLowerCase() === p.name.toLowerCase()),
      );
    try {
      if (ya) {
        await rest.patch("suppliers", `id=eq.${ya.id}&${B}`, {
          alegra_id: p.alegraId,
          phone: p.phone,
          email: p.email,
          rnc: p.rnc ?? ya.rnc,
          updated_at: new Date().toISOString(),
        });
        bump("suppliers", "linked");
      } else {
        await rest.insert("suppliers", {
          business_id: BUSINESS_ID,
          name: p.name,
          rnc: p.rnc,
          phone: p.phone,
          email: p.email,
          alegra_id: p.alegraId,
        });
        bump("suppliers", "created");
      }
    } catch (e) {
      fail("suppliers", e);
    }
  }
}

// ─── Catálogo ─────────────────────────────────────────────────────────────
async function ultimaCuentaItems(): Promise<number | null> {
  try {
    const runs = await rest.getAll<{ counts: Counts }>(
      `alegra_sync_runs?select=counts&${B}&ok=eq.true&dry_run=eq.false&order=started_at.desc&limit=1`,
    );
    return runs[0]?.counts?.items?.read ?? null;
  } catch {
    return null;
  }
}

async function sincronizarCatalogo(items: AlegraItem[]): Promise<void> {
  const productos = await rest.getAll<Record<string, unknown>>(
    `products?select=id,name,alegra_id,barcode,cost,price,itbis_rate,active,sku&${B}&deleted_at=is.null`,
  );
  const existing: ExistingProduct[] = productos.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    alegraId: (p.alegra_id as string) ?? null,
    barcode: (p.barcode as string) ?? null,
    cost: Number(p.cost) || 0,
    price: Number(p.price) || 0,
    itbisRate: Number(p.itbis_rate) || 0,
    active: Boolean(p.active),
  }));
  const previa = await ultimaCuentaItems();
  const plan = planProducts(items, existing, previa);
  for (const a of plan.actions) bump("items", a.kind);
  bump("items", "priceChanged", plan.priceChanged);
  bump("items", "matchedByName", plan.matchedByName);

  const conflictos = plan.actions.flatMap((a) => {
    if (a.kind !== "update") return [];
    if (a.barcodeConflict) {
      return [{ productId: a.productId, name: a.draft.alegraName, motivo: "codigo-distinto", ...a.barcodeConflict }];
    }
    if (a.barcodeTakenBy) {
      return [
        {
          productId: a.productId,
          name: a.draft.alegraName,
          motivo: "codigo-ya-usado-por-otro-producto",
          alegra: a.draft.barcode,
          loTiene: a.barcodeTakenBy,
        },
      ];
    }
    return [];
  });
  // Un `update` cuyo patch solo trae `alegra_id` y ya lo tenía no cambia nada.
  const actualizar = plan.actions.filter(
    (a): a is Extract<(typeof plan.actions)[number], { kind: "update" }> =>
      a.kind === "update" && (Object.keys(a.patch).length > 1 || !existing.find((e) => e.id === a.productId)?.alegraId),
  );
  const crear = plan.actions.filter((a): a is Extract<(typeof plan.actions)[number], { kind: "create" }> => a.kind === "create");
  const desactivar = plan.actions.filter(
    (a): a is Extract<(typeof plan.actions)[number], { kind: "deactivate" }> => a.kind === "deactivate",
  );
  console.log(
    `Productos: ${items.length} leídos · crear ${crear.length} · actualizar ${actualizar.length} (precio cambia en ${plan.priceChanged}) · desactivar ${desactivar.length} · emparejados por nombre ${plan.matchedByName} · conflictos de código ${conflictos.length}${plan.guardTripped ? " · ⚠️ GUARDIA ANTI-VACÍO: no se desactiva nada" : ""}`,
  );
  if (plan.guardTripped) {
    errors.push({
      entity: "items",
      message: `Alegra devolvió ${items.length} ítems, menos del 50 % de la corrida anterior (${previa}); no se desactivó nada.`,
    });
  }
  const cambiosDePrecio = actualizar.flatMap((a) => {
    if (a.patch.price === undefined) return [];
    const antes = existing.find((e) => e.id === a.productId);
    return [
      {
        productId: a.productId,
        name: antes?.name ?? a.draft.displayName,
        precioDermaLand: antes?.price ?? 0,
        precioAlegra: a.patch.price,
        costoAlegra: a.draft.cost,
      },
    ];
  });
  if (cambiosDePrecio.length) escribirReporte("productos-cambia-precio.json", cambiosDePrecio);
  if (conflictos.length) escribirReporte("productos-conflictos-codigo.json", conflictos);
  if (crear.length) escribirReporte("productos-a-crear.json", crear.map((a) => a.draft));
  if (desactivar.length) escribirReporte("productos-a-desactivar.json", desactivar);
  if (!APPLY) return;

  const cats = await rest.getAll<{ id: string; name: string }>(`product_categories?select=id,name&${B}`);
  const marcas = await rest.getAll<{ id: string; name: string }>(`brands?select=id,name&${B}`);
  const catPorNombre = new Map(cats.map((c) => [c.name, c.id]));
  const marcaPorNombre = new Map(marcas.map((m) => [m.name.toLowerCase(), m.id]));
  let sku = nextSkuFromSkus(productos.map((p) => p.sku as string));

  for (const a of crear) {
    const parsed = parseProductName(a.draft.alegraName);
    const categoryId = catPorNombre.get(CATEGORIA_POR_PARSER[parsed.categoryId] ?? "Cuidado facial") ?? null;
    const brandId = parsed.brandName ? (marcaPorNombre.get(parsed.brandName.toLowerCase()) ?? null) : null;
    let creado = false;
    for (let intento = 0; intento < 10 && !creado; intento++) {
      try {
        await rest.insert("products", {
          business_id: BUSINESS_ID,
          sku,
          name: a.draft.displayName,
          barcode: a.draft.barcode,
          brand_id: brandId,
          category_id: categoryId,
          unit: "unidad",
          pharmaceutical_form: parsed.pharmaceuticalForm ?? null,
          presentation: parsed.content ? parsed.content.toLowerCase() : null,
          requires_prescription: false,
          controlled: false,
          cost: a.draft.cost,
          price: a.draft.price,
          itbis_rate: a.draft.itbisRate,
          min_stock: 0,
          max_stock: 0,
          active: a.draft.active,
          sellable: true,
          alegra_id: a.draft.alegraId,
        });
        creado = true;
        bump("items", "created");
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "23505" && /sku/i.test(err.message)) {
          sku = nextSkuAfter(sku);
          continue;
        }
        fail("items", e);
        break;
      }
    }
    sku = nextSkuAfter(sku);
  }

  for (const a of actualizar) {
    try {
      await rest.patch("products", `id=eq.${a.productId}&${B}`, { ...a.patch, updated_at: new Date().toISOString() });
      bump("items", "updated");
    } catch (e) {
      fail("items", e);
    }
  }
  for (const a of desactivar) {
    try {
      await rest.patch("products", `id=eq.${a.productId}&${B}`, { active: false, updated_at: new Date().toISOString() });
      bump("items", "deactivated");
    } catch (e) {
      fail("items", e);
    }
  }
}

// ─── Stock ────────────────────────────────────────────────────────────────
async function sincronizarStock(items: AlegraItem[]): Promise<void> {
  const db = await loadDb(rest);
  const nombrePorAlegraId = new Map(
    db.products.filter((p) => p.alegra_id).map((p) => [String(p.alegra_id), p.name]),
  );
  const rows = stockRowsFromItems(items, (id) => nombrePorAlegraId.get(id));
  const plan = buildImportPlan({
    rows,
    ...fuentesPlan(db),
    cutisWarehouseId: db.whSegunda,
    zeroMissing: false,
    today: todayRD(),
  });
  bump("stock", "rows", rows.length);
  bump("stock", "principal", plan.principal.length);
  bump("stock", "segunda", plan.cutis.length);
  bump("stock", "newLots", plan.cutis.filter((a) => a.newLot).length);
  bump("stock", "skipped", plan.skipped.length);
  bump("stock", "unmatched", plan.unmatched.length);
  console.log(
    `Stock: ${rows.length} productos · ${db.principal.name} ${plan.totals.principalBefore}→${plan.totals.principalAfter} (${plan.principal.length} ajustes) · ${db.segunda.name} ${plan.totals.cutisBefore}→${plan.totals.cutisAfter} (${plan.cutis.length} ajustes) · omitidos ${plan.skipped.length}`,
  );
  for (const s of plan.skipped.slice(0, 10)) console.log(`    · omitido: ${s.name} — ${s.error}`);
  if (plan.skipped.length) escribirReporte("stock-omitidos.json", plan.skipped);
  if (!APPLY) return;

  const res = await aplicarPlan(rest, db, plan, {
    reference,
    reason: `Sincronización Alegra ${reference} — stock igualado a Alegra`,
    userId: OWNER_USER_ID,
    userName: USER_NAME,
  });
  bump("stock", "movements", res.movements);
  bump("stock", "lotsCreated", res.lotsCreated);
  bump("stock", "lotsUpdated", res.lotsUpdated);
  for (const f of res.failures) fail("stock", `${f.productName}: ${f.error}`);

  const v = verificar(rows, await loadDb(rest));
  bump("stock", "verifiedOk", v.cuadran);
  bump("stock", "verifiedBad", v.noCuadran.length);
  console.log(`  Verificación: ${v.cuadran}/${v.comparados} cuadran`);
  if (v.noCuadran.length) escribirReporte("stock-no-cuadran.json", v.noCuadran);
}

// ─── Facturas ─────────────────────────────────────────────────────────────
async function sincronizarFacturas(): Promise<void> {
  const db = await loadDb(rest);
  const branchPorAlmacen = new Map([
    ["1", db.principal.id],
    ["2", db.segunda.id],
  ]);
  const clientePorAlegraId = new Map(
    (
      await rest.getAll<{ id: string; alegra_id: string }>(`clients?select=id,alegra_id&${B}&alegra_id=not.is.null`)
    ).map((c) => [c.alegra_id, c.id]),
  );
  const productoPorAlegraId = new Map(
    (
      await rest.getAll<{ id: string; alegra_id: string }>(`products?select=id,alegra_id&${B}&alegra_id=not.is.null`)
    ).map((p) => [p.alegra_id, p.id]),
  );
  // 🔴 El vendedor. Alegra manda `seller.name` como texto libre y NO el enlace
  // al usuario de DermaLand, así que sin esto cada factura nueva entraba con
  // `seller_id` NULL y se quedaba fuera de la comisión sin que nadie lo notara
  // — se descubrió con 7 facturas del mismo día ya sueltas.
  const vendedorPorNombre = await cargarVendedores();
  // Y para las que Alegra manda SIN vendedor: la encargada de la sucursal. La
  // regla vive en `branches.default_seller_id`, no aquí, para que se pueda
  // cambiar sin tocar este guion.
  const vendedorPorSucursal = new Map(
    (
      await rest.getAll<{ id: string; default_seller_id: string | null }>(
        `branches?select=id,default_seller_id&${B}&default_seller_id=not.is.null`,
      )
    ).map((b) => [b.id, b.default_seller_id!]),
  );

  // Sin `order_field`: `listAll` ordena por id, la única clave total. Ordenar
  // por fecha hacía que la paginación repitiera y perdiera facturas.
  const consultas: Array<Record<string, string>> = FULL
    ? [{}]
    : [
        { date_afterOrNow: SINCE ?? diasAtras(3) },
        { status: "open" },
        { status: "void", date_afterOrNow: diasAtras(30) },
      ];
  const vistas = new Set<string>();

  for (const q of consultas) {
    await alegra.listAll<AlegraInvoice>("invoices", q, async (page) => {
      const nuevas = page.filter((i) => !vistas.has(String(i.id)));
      for (const i of nuevas) vistas.add(String(i.id));
      bump("invoices", "read", nuevas.length);
      if (!APPLY || nuevas.length === 0) return;

      const cabeceras = nuevas.map((i) => {
        const { invoice } = invoiceToRows(i);
        const { warehouse_id, ...fila } = invoice;
        const branchId = warehouse_id ? (branchPorAlmacen.get(warehouse_id) ?? null) : null;
        return {
          ...fila,
          business_id: BUSINESS_ID,
          branch_id: branchId,
          client_id: invoice.alegra_client_id ? (clientePorAlegraId.get(invoice.alegra_client_id) ?? null) : null,
          seller_id: resolverVendedor(fila.seller_name, branchId, vendedorPorNombre, vendedorPorSucursal),
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      try {
        const guardadas = await rest.upsert<{ id: string; alegra_id: string }>(
          "alegra_invoices",
          cabeceras,
          "business_id,alegra_id",
        );
        const idPorAlegra = new Map(guardadas.map((g) => [g.alegra_id, g.id]));
        const lineas = nuevas.flatMap((i) => {
          const invoiceId = idPorAlegra.get(String(i.id));
          if (!invoiceId) return [];
          return invoiceToRows(i).items.map((l) => ({
            ...l,
            business_id: BUSINESS_ID,
            invoice_id: invoiceId,
            product_id: l.alegra_item_id ? (productoPorAlegraId.get(l.alegra_item_id) ?? null) : null,
          }));
        });
        if (lineas.length) await rest.upsert("alegra_invoice_items", lineas, "invoice_id,line_no");
        bump("invoices", "upserted", guardadas.length);
        bump("invoices", "lines", lineas.length);
      } catch (e) {
        fail("invoices", e);
      }
    });
  }
  console.log(
    `Facturas: ${counts.invoices?.read ?? 0} leídas · ${counts.invoices?.upserted ?? 0} guardadas · ${counts.invoices?.lines ?? 0} líneas`,
  );
  await reenlazarFacturas(clientePorAlegraId, productoPorAlegraId);
}

/**
 * Los vendedores de DermaLand, indexados por su nombre NORMALIZADO.
 *
 * Se normaliza —minúsculas, sin tildes, sin espacios de más— porque Alegra
 * escribe «LAURA MEJIA» y en DermaLand la persona es «Laura Mejía». Comparar
 * el texto tal cual las trataría como dos vendedoras distintas y le partiría
 * las ventas —y la comisión— en dos.
 */
async function cargarVendedores(): Promise<Map<string, string>> {
  const usuarios = await rest.getAll<{ id: string; full_name: string | null }>(
    `users?select=id,full_name&${B}&deleted_at=is.null`,
  );
  const m = new Map<string, string>();
  for (const u of usuarios) {
    const clave = normalizarNombre(u.full_name);
    // El primero gana: si hubiera dos con el mismo nombre normalizado, quedarse
    // con uno es determinista; alternarlos movería la comisión entre corridas.
    if (clave && !m.has(clave)) m.set(clave, u.id);
  }
  return m;
}

/**
 * Ata las facturas que quedaron sin vendedor en corridas anteriores: la persona
 * no existía todavía como usuario, o la sucursal no tenía encargada. Se
 * recalcula con las mismas reglas que el mapeo, no con otras.
 */
async function reenlazarVendedores(): Promise<void> {
  const sueltas = await rest.getAll<{
    id: string;
    seller_name: string | null;
    branch_id: string | null;
  }>(`alegra_invoices?select=id,seller_name,branch_id&${B}&seller_id=is.null`);
  if (sueltas.length === 0) return;

  const porNombre = await cargarVendedores();
  const porSucursal = new Map(
    (
      await rest.getAll<{ id: string; default_seller_id: string | null }>(
        `branches?select=id,default_seller_id&${B}&default_seller_id=not.is.null`,
      )
    ).map((b) => [b.id, b.default_seller_id!]),
  );

  let atadas = 0;
  for (const inv of sueltas) {
    const sellerId = resolverVendedor(inv.seller_name, inv.branch_id, porNombre, porSucursal);
    if (!sellerId) continue;
    try {
      await rest.patch("alegra_invoices", `id=eq.${inv.id}&${B}`, {
        seller_id: sellerId,
        updated_at: new Date().toISOString(),
      });
      atadas++;
    } catch (e) {
      fail("invoices", e);
    }
  }
  if (atadas) console.log(`  Vendedor: ${atadas} facturas atadas (de ${sueltas.length} sueltas)`);
}

/**
 * Enlaza facturas y líneas que quedaron sin `client_id` / `product_id` porque
 * el contacto o el ítem aún no tenían ficha en DermaLand. Es barato y hace que
 * el historial se vaya completando solo en cada corrida.
 */
async function reenlazarFacturas(
  clientePorAlegraId: Map<string, string>,
  productoPorAlegraId: Map<string, string>,
): Promise<void> {
  // El vendedor de las que quedaron sueltas: o porque la persona aún no existía
  // como usuario, o porque la sucursal no tenía encargada asignada. Barato y
  // hace que la atribución se complete sola en cada corrida.
  await reenlazarVendedores();

  const facturas = await rest.getAll<{ id: string; alegra_client_id: string }>(
    `alegra_invoices?select=id,alegra_client_id&${B}&client_id=is.null&alegra_client_id=not.is.null`,
  );
  let f = 0;
  for (const inv of facturas) {
    const clientId = clientePorAlegraId.get(inv.alegra_client_id);
    if (!clientId) continue;
    try {
      await rest.patch("alegra_invoices", `id=eq.${inv.id}&${B}`, { client_id: clientId, updated_at: new Date().toISOString() });
      f++;
    } catch (e) {
      fail("invoices", e);
    }
  }
  const lineas = await rest.getAll<{ id: string; alegra_item_id: string }>(
    `alegra_invoice_items?select=id,alegra_item_id&${B}&product_id=is.null&alegra_item_id=not.is.null`,
  );
  let l = 0;
  for (const li of lineas) {
    const productId = productoPorAlegraId.get(li.alegra_item_id);
    if (!productId) continue;
    try {
      await rest.patch("alegra_invoice_items", `id=eq.${li.id}&${B}`, { product_id: productId });
      l++;
    } catch (e) {
      fail("invoices", e);
    }
  }
  bump("invoices", "relinkedInvoices", f);
  bump("invoices", "relinkedLines", l);
  console.log(
    `  Re-enlace: ${f}/${facturas.length} facturas y ${l}/${lineas.length} líneas que estaban sueltas`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────
console.log(
  `\n${APPLY ? "⚠️  MODO APLICAR" : "🔍 SIMULACIÓN (dry-run)"} · ${FULL ? "carga completa" : "incremental"} · entidades: ${[...ENTITIES].join(",")} · referencia ${reference}\n`,
);
const runId = await abrirCorrida();

let contactos: AlegraContact[] = [];
if (ENTITIES.has("contacts") && !abortar) {
  try {
    contactos = await alegra.listAll<AlegraContact>("contacts", { mode: "simple" });
    bump("contacts", "read", contactos.length);
    await sincronizarContactos(contactos);
    await sincronizarProveedores(contactos);
  } catch (e) {
    fail("contacts", e);
  }
}

let items: AlegraItem[] = [];
if ((ENTITIES.has("items") || ENTITIES.has("stock")) && !abortar) {
  try {
    items = await alegra.listAll<AlegraItem>("items", { fields: "customFields" });
    bump("items", "read", items.length);
  } catch (e) {
    fail("items", e);
  }
}
if (ENTITIES.has("items") && items.length > 0 && !abortar) {
  try {
    await sincronizarCatalogo(items);
  } catch (e) {
    fail("items", e);
  }
}
if (ENTITIES.has("stock") && items.length > 0 && !abortar) {
  try {
    await sincronizarStock(items);
  } catch (e) {
    fail("stock", e);
  }
}
if (ENTITIES.has("invoices") && !abortar) {
  try {
    await sincronizarFacturas();
  } catch (e) {
    fail("invoices", e);
  }
}

await cerrarCorrida(runId);
