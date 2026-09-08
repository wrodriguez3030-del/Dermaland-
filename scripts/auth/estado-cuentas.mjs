#!/usr/bin/env node
/**
 * Estado de acceso de cada persona del sistema. SOLO LECTURA.
 *
 * Por cada fila de `public.users`: si tiene cuenta en Auth, factores TOTP
 * verificados, rol del claim y si es super_admin, último acceso, bloqueo,
 * si tiene clave en la bóveda (solo el hecho; NUNCA la clave ni el sobre) y
 * computadoras de confianza activas.
 *
 * Uso:  node scripts/auth/estado-cuentas.mjs
 */
import { clienteAdmin, todasLasCuentas, totpVerificados, fecha } from "./_comun.mjs";

const admin = clienteAdmin();

const { data: fichas, error } = await admin
  .from("users")
  .select("id,email,full_name,role,status,business_id")
  .is("deleted_at", null)
  .order("full_name")
  .range(0, 999);
if (error) {
  console.error("No se pudo leer public.users:", error.message);
  process.exit(1);
}

const cuentas = new Map((await todasLasCuentas(admin)).map((u) => [u.id, u]));

// Tablas de la migración 20260909100000: si aún no está aplicada, se dice y
// no se rompe.
async function opcional(tabla, columnas) {
  const r = await admin.from(tabla).select(columnas).range(0, 999);
  return r.error ? null : r.data ?? [];
}
const boveda = await opcional("user_password_vault", "user_id,set_at,stale");
const dispositivos = await opcional("trusted_devices", "user_id,expires_at,revoked_at");

const filas = [];
for (const f of fichas ?? []) {
  const c = cuentas.get(f.id);
  const m = c?.app_metadata ?? {};
  const b = boveda?.find((v) => v.user_id === f.id);
  const activos = dispositivos
    ? dispositivos.filter((d) => d.user_id === f.id && !d.revoked_at && new Date(d.expires_at) > new Date()).length
    : "?";
  filas.push({
    nombre: f.full_name,
    correo: f.email,
    ficha_rol: f.role,
    estado: f.status,
    cuenta: c ? "sí" : "NO",
    claim_rol: c ? String(m.role ?? "—") : "—",
    super_admin: c ? (m.is_platform_admin === true ? "SÍ" : "no") : "—",
    totp: c ? (await totpVerificados(admin, c.id)) ?? "?" : "—",
    ultimo_acceso: c ? fecha(c.last_sign_in_at) : "—",
    bloqueada: c ? (c.banned_until && new Date(c.banned_until) > new Date() ? "SÍ" : "no") : "—",
    boveda: boveda === null ? "(sin migrar)" : b ? (b.stale ? "desincronizada" : `asignada ${fecha(b.set_at)}`) : "no",
    pcs_confianza: dispositivos === null ? "(sin migrar)" : activos,
  });
}
console.table(filas);

// Cuentas de Auth sin ficha: existen, pero el sistema no las conoce.
const huerfanas = [...cuentas.values()].filter((c) => !(fichas ?? []).some((f) => f.id === c.id));
if (huerfanas.length) {
  console.log("\nCuentas de Auth SIN ficha en public.users:");
  for (const c of huerfanas) {
    console.log(`  · ${c.email}  rol=${c.app_metadata?.role ?? "—"}  super_admin=${c.app_metadata?.is_platform_admin === true ? "SÍ" : "no"}  último acceso=${fecha(c.last_sign_in_at)}`);
  }
}
