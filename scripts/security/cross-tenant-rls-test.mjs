#!/usr/bin/env node
/**
 * PRUEBA CROSS-TENANT (RLS) — verifica en VIVO que una empresa no puede ver ni
 * modificar datos de otra, usando el JWT REAL de cada usuario (RLS aplica).
 * También prueba que el vector SEC-001 está cerrado (user_metadata no escala).
 *
 * Crea dos empresas de prueba (T-A, T-B) con un usuario y un producto cada una,
 * corre las verificaciones, y BORRA todo al final (no toca datos reales).
 *
 * Uso:  node scripts/security/cross-tenant-rls-test.mjs
 * Lee apps/web/.env.local (service_role + anon). NUNCA imprime claves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const env = {};
for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SRK) { console.error("Faltan env vars"); process.exit(1); }

const PLAN_ID = "00000000-0000-0000-0000-000000000001";
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ✅ ${name}`); };
const bad = (name, extra = "") => { fail++; console.log(`  ❌ ${name} ${extra}`); };

const rnd = () => Math.random().toString(36).slice(2, 8);
const stamp = rnd();

async function makeBusiness(tag) {
  const { data, error } = await admin.from("businesses").insert({
    legal_name: `SECTEST ${tag} ${stamp}`,
    commercial_name: `SECTEST ${tag}`,
    rnc: `ST${tag}${stamp}`,
    plan_id: PLAN_ID,
    status: "trial",
  }).select("id").single();
  if (error) throw new Error(`crear business ${tag}: ${error.message}`);
  return data.id;
}

async function makeProduct(bizId, tag) {
  const { data, error } = await admin.from("products").insert({
    business_id: bizId,
    sku: `SEC-${tag}-${stamp}`,
    name: `Producto secreto de ${tag}`,
    unit: "unidad",
    requires_prescription: false, controlled: false,
    cost: 100, price: 200, itbis_rate: 0.18,
    min_stock: 0, max_stock: 100, active: true, sellable: true,
  }).select("id").single();
  if (error) throw new Error(`crear product ${tag}: ${error.message}`);
  return data.id;
}

async function makeUser(bizId, tag) {
  const email = `sectest-${tag}-${stamp}@example.com`.toLowerCase();
  const password = `Sec!${rnd()}${rnd()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { business_id: bizId, role: "cashier", is_platform_admin: false, full_name: `User ${tag}` },
    user_metadata: { full_name: `User ${tag}` },
  });
  if (error) throw new Error(`crear user ${tag}: ${error.message}`);
  return { id: data.user.id, email, password };
}

/** Cliente autenticado como un usuario (RLS aplica con su JWT). */
async function signedInClient(email, password) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login: ${error.message}`);
  return c;
}

async function run() {
  const created = { businesses: [], users: [], products: [] };
  try {
    console.log("── Setup (service_role) ──");
    const bizA = await makeBusiness("A"); created.businesses.push(bizA);
    const bizB = await makeBusiness("B"); created.businesses.push(bizB);
    const prodA = await makeProduct(bizA, "A"); created.products.push(prodA);
    const prodB = await makeProduct(bizB, "B"); created.products.push(prodB);
    const userA = await makeUser(bizA, "A"); created.users.push(userA.id);
    const userB = await makeUser(bizB, "B"); created.users.push(userB.id);
    console.log(`  empresas A=${bizA.slice(0,8)} B=${bizB.slice(0,8)}`);

    const cA = await signedInClient(userA.email, userA.password);
    const cB = await signedInClient(userB.email, userB.password);

    console.log("\n── 1. Aislamiento de LECTURA ──");
    const aProducts = (await cA.from("products").select("id")).data ?? [];
    const bProducts = (await cB.from("products").select("id")).data ?? [];
    aProducts.map((p) => p.id).includes(prodA) && !aProducts.map((p) => p.id).includes(prodB)
      ? ok("Empresa A ve su producto y NO el de B")
      : bad("A vio productos de B o no vio el suyo", JSON.stringify(aProducts.map((p) => p.id)));
    bProducts.map((p) => p.id).includes(prodB) && !bProducts.map((p) => p.id).includes(prodA)
      ? ok("Empresa B ve su producto y NO el de A")
      : bad("B vio productos de A o no vio el suyo");

    console.log("\n── 2. LECTURA directa por ID de otro tenant ──");
    const bReadsA = (await cB.from("products").select("id,name").eq("id", prodA).maybeSingle()).data;
    bReadsA === null ? ok("B no puede leer el producto de A por su id (IDOR)") : bad("B leyó el producto de A!", JSON.stringify(bReadsA));

    console.log("\n── 3. ESCRITURA sobre otro tenant ──");
    const upd = await cB.from("products").update({ price: 1 }).eq("id", prodA).select("id");
    (upd.data ?? []).length === 0 ? ok("B no puede modificar el producto de A (0 filas)") : bad("B modificó el producto de A!");
    const del = await cB.from("products").delete().eq("id", prodA).select("id");
    (del.data ?? []).length === 0 ? ok("B no puede borrar el producto de A (0 filas)") : bad("B borró el producto de A!");

    console.log("\n── 4. SEC-001: escalar vía user_metadata NO debe funcionar ──");
    // El atacante (B) intenta auto-asignarse la empresa A y ser platform admin.
    await cB.auth.updateUser({ data: { business_id: bizA, role: "admin", is_platform_admin: true } });
    await cB.auth.refreshSession(); // nuevo JWT con el user_metadata manipulado
    const afterAttack = (await cB.from("products").select("id")).data ?? [];
    const stillOnlyB = afterAttack.every((p) => p.id !== prodA) && afterAttack.some((p) => p.id === prodB);
    stillOnlyB
      ? ok("Tras manipular user_metadata, B SIGUE viendo solo su empresa (SEC-001 cerrado)")
      : bad("¡ESCALADA! B vio la empresa A tras editar user_metadata", JSON.stringify(afterAttack.map((p) => p.id)));
    const canReadAafter = (await cB.from("products").select("id").eq("id", prodA).maybeSingle()).data;
    canReadAafter === null ? ok("Tras el ataque, B sigue sin poder leer el producto de A") : bad("¡Escalada de lectura!");

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup (borrando datos de prueba) ──");
    for (const id of created.products) await admin.from("products").delete().eq("id", id);
    for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
    for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
