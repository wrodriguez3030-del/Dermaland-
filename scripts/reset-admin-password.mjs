#!/usr/bin/env node
// Restablece (o crea) la contraseña de un usuario admin en Supabase Auth.
// LA CONTRASEÑA LA ELIGES TÚ y se pasa por variable de entorno para que NO
// quede en el chat ni en logs. Este script no imprime secretos.
//
// Uso (en TU terminal, no en el chat):
//   PowerShell:
//     $env:NEW_ADMIN_PASSWORD="TuClaveSegura123"; node scripts/reset-admin-password.mjs
//   (opcional otro correo)  $env:ADMIN_EMAIL="tu@correo.com"; ...
//   Bash:
//     NEW_ADMIN_PASSWORD='TuClaveSegura123' node scripts/reset-admin-password.mjs
//
// Por defecto actúa sobre preview-admin@dermaland.do (admin ya provisionado).
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
const cfg = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
const URL_ = cfg("NEXT_PUBLIC_SUPABASE_URL");
const KEY = cfg("SUPABASE_SERVICE_ROLE_KEY");

const EMAIL = (process.env.ADMIN_EMAIL || "preview-admin@dermaland.do").toLowerCase();
const PASSWORD = process.env.NEW_ADMIN_PASSWORD || "";

if (!URL_ || !KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}
if (PASSWORD.length < 8) {
  console.error("Define NEW_ADMIN_PASSWORD (mínimo 8 caracteres) en tu terminal antes de correr el script.");
  console.error('Ej. PowerShell:  $env:NEW_ADMIN_PASSWORD="TuClaveSegura123"; node scripts/reset-admin-password.mjs');
  process.exit(1);
}

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const TEMPLATE_EMAIL = (process.env.TEMPLATE_EMAIL || "preview-admin@dermaland.do").toLowerCase();

async function findUser(email) {
  // Busca en páginas hasta encontrar el correo; NO imprime otros usuarios.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
    if (!res.ok) throw new Error(`Auth list ${res.status}`);
    const data = await res.json();
    const users = data.users || data;
    const u = users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u;
    if (users.length < 200) break;
  }
  return null;
}

async function main() {
  const existing = await findUser(EMAIL);

  if (existing) {
    // Ya existe: fija la contraseña y asegura que tenga negocio/rol admin.
    const body = { password: PASSWORD, email_confirm: true };
    const hasBiz = existing.user_metadata?.business_id || existing.app_metadata?.business_id;
    if (!hasBiz && EMAIL !== TEMPLATE_EMAIL) {
      const tpl = await findUser(TEMPLATE_EMAIL);
      if (tpl) {
        body.user_metadata = { ...(tpl.user_metadata ?? {}), full_name: EMAIL };
        body.app_metadata = tpl.app_metadata ?? {};
      }
    }
    const res = await fetch(`${URL_}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`No se pudo actualizar (${res.status}).`);
    console.log(`✅ Contraseña actualizada para ${EMAIL}${body.user_metadata ? " (+ rol admin del negocio)" : ""}. Ya puedes iniciar sesión.`);
    return;
  }

  // Nuevo: copia negocio + rol admin + sucursal del usuario plantilla.
  let user_metadata = {};
  let app_metadata = {};
  if (EMAIL !== TEMPLATE_EMAIL) {
    const tpl = await findUser(TEMPLATE_EMAIL);
    if (!tpl) throw new Error(`No encontré la plantilla ${TEMPLATE_EMAIL} para copiar el rol admin.`);
    user_metadata = { ...(tpl.user_metadata ?? {}), full_name: EMAIL };
    app_metadata = tpl.app_metadata ?? {};
  }
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata, app_metadata }),
  });
  if (!res.ok) throw new Error(`No se pudo crear (${res.status}).`);
  console.log(`✅ Usuario admin ${EMAIL} creado (negocio + rol admin copiados de ${TEMPLATE_EMAIL}). Ya puedes iniciar sesión.`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
