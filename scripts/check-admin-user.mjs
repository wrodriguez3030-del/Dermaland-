#!/usr/bin/env node
// Diagnóstico de login: comprueba SOLO el usuario admin objetivo en Supabase
// Auth (existe / email confirmado / último acceso). No enumera otros usuarios
// ni imprime datos personales de terceros ni secretos.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
const URL_ = get("NEXT_PUBLIC_SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_ROLE_KEY");
const TARGET = (process.argv[2] || "preview-admin@dermaland.do").toLowerCase();

const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.log("No se pudo consultar Auth:", res.status);
  process.exit(1);
}
const data = await res.json();
const users = data.users || data;
const u = users.find((x) => (x.email || "").toLowerCase() === TARGET);

if (!u) {
  console.log(`Usuario ${TARGET}: NO existe en Auth de este proyecto.`);
  console.log(`(Total de usuarios en Auth: ${users.length}.)`);
} else {
  console.log(`Usuario ${TARGET}: EXISTE`);
  console.log(`  email confirmado: ${u.email_confirmed_at ? "sí" : "NO (no podrá iniciar sesión)"}`);
  console.log(`  último acceso: ${u.last_sign_in_at || "nunca"}`);
  console.log(`  baneado: ${u.banned_until ? "sí" : "no"}`);
}
