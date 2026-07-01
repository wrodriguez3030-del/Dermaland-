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

async function findUserId(email) {
  // Busca en páginas hasta encontrar el correo; NO imprime otros usuarios.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
    if (!res.ok) throw new Error(`Auth list ${res.status}`);
    const data = await res.json();
    const users = data.users || data;
    const u = users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u.id;
    if (users.length < 200) break;
  }
  return null;
}

async function main() {
  const id = await findUserId(EMAIL);
  if (id) {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`No se pudo actualizar (${res.status}).`);
    console.log(`✅ Contraseña actualizada para ${EMAIL}. Ya puedes iniciar sesión.`);
  } else {
    const res = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`No se pudo crear (${res.status}).`);
    console.log(`✅ Usuario ${EMAIL} creado con contraseña. Ya puedes iniciar sesión.`);
    console.log("Nota: si es un correo NUEVO, puede requerir perfil/rol de admin en la app;");
    console.log("para acceso admin completo usa preview-admin@dermaland.do (ya provisionado).");
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
