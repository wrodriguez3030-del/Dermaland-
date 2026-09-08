/**
 * Piezas compartidas por los guiones de `scripts/auth/`: entorno, cliente con
 * service_role y búsqueda de cuentas por correo. Nunca imprimen el valor de
 * ninguna clave.
 *
 * Copiado de `scripts/mfa-break-glass.mjs` (mismas garantías): `listUsers`
 * pagina de a 50 y no avisa de que se quedó corta, así que se recorren TODAS
 * las páginas.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

let cacheEnv = null;
export function env(clave) {
  const delProceso = process.env[clave];
  if (delProceso && delProceso.trim()) return delProceso.trim();
  if (cacheEnv === null) {
    cacheEnv = {};
    const archivo = path.join(root, "apps/web/.env.local");
    if (existsSync(archivo)) {
      for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) cacheEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  const valor = cacheEnv[clave];
  if (!valor) {
    console.error(`ERROR: falta ${clave} (entorno o apps/web/.env.local).`);
    process.exit(1);
  }
  return valor;
}

export function clienteAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Todas las cuentas de Auth, recorriendo todas las páginas. */
export async function todasLasCuentas(admin) {
  const cuentas = [];
  const porPagina = 200;
  for (let pagina = 1; pagina <= 100; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: porPagina });
    if (error) {
      console.error("No se pudo listar usuarios de Auth:", error.message);
      process.exit(1);
    }
    const usuarios = data?.users ?? [];
    cuentas.push(...usuarios);
    if (usuarios.length < porPagina) break;
  }
  return cuentas;
}

export async function buscarPorCorreo(admin, objetivo) {
  const buscado = objetivo.trim().toLowerCase();
  return (await todasLasCuentas(admin)).filter((u) => u.email?.trim().toLowerCase() === buscado);
}

/** Factores TOTP verificados de una cuenta (lo mismo que mira la puerta de 2FA). */
export async function totpVerificados(admin, userId) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return null;
  return (data?.factors ?? []).filter((f) => f.status === "verified" && f.factor_type === "totp").length;
}

export function fecha(v) {
  return v ? new Date(v).toLocaleString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}
