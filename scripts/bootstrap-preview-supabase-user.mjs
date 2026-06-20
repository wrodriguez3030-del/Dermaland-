#!/usr/bin/env node
/**
 * Bootstrap de usuario admin para Preview (DATA_SOURCE=supabase).
 *
 * Idempotente: lo podes correr N veces. No imprime password ni service role.
 *
 * Uso:
 *   node scripts/bootstrap-preview-supabase-user.mjs
 *
 * Variables que lee de apps/web/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL        - URL del proyecto Supabase.
 *   SUPABASE_SERVICE_ROLE_KEY       - service role (NO lo imprimimos jamas).
 *   PREVIEW_ADMIN_EMAIL             - email del usuario seed (default:
 *                                     preview-admin@dermaland.do)
 *   PREVIEW_ADMIN_PASSWORD          - password (>=12 chars). Si falta, el
 *                                     script termina con instrucciones.
 *
 * Lo que hace:
 *   1. Verifica que el business demo (id `0000...d001`) existe en public.businesses.
 *   2. Verifica que la branch demo (id `0000...b001`) existe.
 *   3. Crea (o actualiza) el usuario en auth.users via Admin API con:
 *        email_confirm: true
 *        app_metadata: { business_id, role: "admin", is_platform_admin: false,
 *                        branch_id, branch_ids, full_name }
 *        user_metadata: { ...mismos campos por compatibilidad con context.ts }
 *   4. Upsert en public.users con el MISMO uuid de auth.users.
 *
 * Output (sin secretos):
 *   - "[ok] business: <id>"
 *   - "[ok] branch:   <id>"
 *   - "[created|updated] auth user: <email>"
 *   - "[upserted] public.users row for <email>"
 *
 * NO toca DGII real. NO sube certificados. NO modifica produccion.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function pathToFileUrl(p) {
  return pathToFileURL(p).href;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, "apps", "web", ".env.local");

const BUSINESS_ID = "00000000-0000-0000-0000-00000000d001";
const BRANCH_ID = "00000000-0000-0000-0000-00000000b001";
const DEFAULT_EMAIL = "preview-admin@dermaland.do";
const DEFAULT_FULL_NAME = "Preview Admin";

function die(msg, code = 1) {
  console.error(`[bootstrap-preview] ${msg}`);
  process.exit(code);
}

function ok(msg) {
  console.log(`[bootstrap-preview] ${msg}`);
}

// ---- 1) Cargar .env.local sin imprimir valores ----
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    die(`no encontre apps/web/.env.local en ${ENV_PATH}`);
  }
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = env.PREVIEW_ADMIN_EMAIL || DEFAULT_EMAIL;
const PASSWORD = env.PREVIEW_ADMIN_PASSWORD;
const FULL_NAME = env.PREVIEW_ADMIN_FULL_NAME || DEFAULT_FULL_NAME;

if (!SUPABASE_URL) die("falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
if (!SERVICE_ROLE) die("falta SUPABASE_SERVICE_ROLE_KEY en .env.local");

if (!PASSWORD) {
  console.error(
    [
      "[bootstrap-preview] Falta PREVIEW_ADMIN_PASSWORD en apps/web/.env.local.",
      "",
      "Agregalo manualmente (no lo pego en el chat). Sugerencia:",
      "  - Generar 24+ chars random: openssl rand -base64 24",
      "  - Pegarlo en apps/web/.env.local como:",
      "      PREVIEW_ADMIN_EMAIL=preview-admin@dermaland.do  # opcional",
      "      PREVIEW_ADMIN_PASSWORD=<la-password-generada>",
      "  - Volver a correr este script.",
      "",
      "El archivo .env.local esta gitignored (no se publica).",
    ].join("\n"),
  );
  process.exit(2);
}

// Política de contraseña fuerte (R-SEC-01: control compensatorio del gap de
// Leaked Password Protection en plan Free — ver docs/security.md). Espejo de
// apps/web/src/lib/auth/password-policy.ts. NUNCA imprime la contraseña.
{
  const BLOCKED = new Set([
    "password", "password123", "123456", "12345678", "123456789",
    "admin123", "dermaland123", "qwerty123", "qwerty", "111111",
    "abc123", "iloveyou", "letmein", "contraseña", "contrasena",
  ]);
  const problems = [];
  if (PASSWORD.length < 12) problems.push("mínimo 12 caracteres");
  if (!/[A-ZÁÉÍÓÚÑ]/.test(PASSWORD)) problems.push("una mayúscula");
  if (!/[a-záéíóúñ]/.test(PASSWORD)) problems.push("una minúscula");
  if (!/[0-9]/.test(PASSWORD)) problems.push("un número");
  if (!/[^A-Za-z0-9]/.test(PASSWORD)) problems.push("un símbolo");
  if (BLOCKED.has(PASSWORD.trim().toLowerCase()))
    problems.push("no usar contraseñas comunes");
  if (problems.length > 0) {
    // No imprimimos la contraseña, solo qué reglas faltan.
    die(`PREVIEW_ADMIN_PASSWORD no cumple la política: falta ${problems.join(", ")}.`);
  }
}

// ---- 2) Importar @supabase/supabase-js desde el workspace web ----
let createClient;
try {
  const supabaseEntry = path.join(
    REPO_ROOT,
    "apps",
    "web",
    "node_modules",
    "@supabase",
    "supabase-js",
    "dist",
    "index.mjs",
  );
  const mod = await import(pathToFileUrl(supabaseEntry));
  createClient = mod.createClient;
} catch (e) {
  die(
    `no pude importar @supabase/supabase-js desde apps/web/node_modules. ` +
      `Corre 'pnpm install' primero. Detalle: ${e?.message ?? e}`,
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- 3) Verificar business + branch ----
async function ensureBusiness() {
  const { data, error } = await admin
    .from("businesses")
    .select("id, commercial_name")
    .eq("id", BUSINESS_ID)
    .maybeSingle();
  if (error) die(`error consultando businesses: ${error.message}`);
  if (!data) {
    die(
      `no existe business ${BUSINESS_ID}. ` +
        `Aplica primero supabase/migrations/0001_phase1_core.sql.`,
    );
  }
  ok(`business: ${data.id} (${data.commercial_name})`);
}

async function ensureBranch() {
  const { data, error } = await admin
    .from("branches")
    .select("id, code")
    .eq("id", BRANCH_ID)
    .maybeSingle();
  if (error) die(`error consultando branches: ${error.message}`);
  if (!data) {
    die(
      `no existe branch ${BRANCH_ID}. ` +
        `Aplica supabase/migrations/0001_phase1_core.sql.`,
    );
  }
  ok(`branch: ${data.id} (${data.code})`);
}

// ---- 4) Crear o actualizar usuario auth ----
async function findAuthUser(email) {
  // listUsers no tiene filtro por email; iteramos primera pagina (suficiente
  // para preview donde hay pocos usuarios).
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) die(`auth.admin.listUsers fallo: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function ensureAuthUser() {
  const metadata = {
    full_name: FULL_NAME,
    business_id: BUSINESS_ID,
    branch_id: BRANCH_ID,
    branch_ids: [BRANCH_ID],
    role: "admin",
    is_platform_admin: false,
  };

  const existing = await findAuthUser(EMAIL);

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    });
    if (error) die(`auth.admin.createUser fallo: ${error.message}`);
    ok(`created auth user: ${EMAIL}`);
    return data.user;
  }

  // Idempotente: actualizamos metadata y password.
  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: metadata,
  });
  if (error) die(`auth.admin.updateUserById fallo: ${error.message}`);
  ok(`updated auth user: ${EMAIL}`);
  return data.user;
}

// ---- 5) Upsert en public.users ----
async function upsertPublicUser(authUser) {
  const row = {
    id: authUser.id,
    business_id: BUSINESS_ID,
    email: EMAIL,
    full_name: FULL_NAME,
    role: "admin",
    branch_ids: [BRANCH_ID],
    two_factor_enabled: false,
    status: "active",
    avatar_color: "#1A7F8E",
  };
  const { error } = await admin
    .from("users")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();
  if (error) die(`upsert public.users fallo: ${error.message}`);
  ok(`upserted public.users row for ${EMAIL}`);
}

(async () => {
  ok(`target supabase: ${new URL(SUPABASE_URL).hostname}`);
  await ensureBusiness();
  await ensureBranch();
  const authUser = await ensureAuthUser();
  await upsertPublicUser(authUser);
  ok("done. Preview admin listo. NO se imprimio password.");
})().catch((e) => {
  die(`uncaught: ${e?.stack || e?.message || e}`);
});
