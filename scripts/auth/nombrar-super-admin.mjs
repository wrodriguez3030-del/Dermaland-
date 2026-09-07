#!/usr/bin/env node
/**
 * Nombra (o revierte) al super_admin del sistema. Corre FUERA de la aplicación,
 * con la service_role que solo tiene el dueño: la app JAMÁS escribe
 * `is_platform_admin=true` ni `role:'super_admin'` (SEC-001 / DL-08).
 *
 * Hace las dos cosas que tienen que ir juntas, y si la segunda falla deshace
 * la primera:
 *   1. `app_metadata` de Auth: `{ ...actual, role: 'super_admin', is_platform_admin: true }`
 *      (conserva business_id, branch_id, branch_ids, full_name).
 *   2. `public.users.role = 'super_admin'` (exige el CHECK ampliado por la
 *      migración 20260909100000; si no está aplicada, se avisa y se revierte
 *      el paso 1 para no dejar el claim y la ficha discrepando).
 *
 * Exige que la cuenta tenga un TOTP verificado: un super_admin sin segundo
 * factor sería peor que no tener super_admin.
 *
 * Uso:
 *   node scripts/auth/nombrar-super-admin.mjs --email correo@dominio        (solo enseña)
 *   node scripts/auth/nombrar-super-admin.mjs --email correo@dominio --apply
 *   node scripts/auth/nombrar-super-admin.mjs --email correo@dominio --apply --revertir
 */
import { createInterface } from "node:readline/promises";
import { clienteAdmin, buscarPorCorreo, totpVerificados } from "./_comun.mjs";

const args = process.argv.slice(2);
const email = args[args.indexOf("--email") + 1];
const aplicar = args.includes("--apply");
const revertir = args.includes("--revertir");
if (!email || args.indexOf("--email") === -1) {
  console.error("Uso: node scripts/auth/nombrar-super-admin.mjs --email <correo> [--apply] [--revertir]");
  process.exit(1);
}

const admin = clienteAdmin();
const coincidencias = await buscarPorCorreo(admin, email);
if (coincidencias.length !== 1) {
  console.error(coincidencias.length === 0 ? `No existe ninguna cuenta con el correo ${email}.` : `Hay ${coincidencias.length} cuentas con ese correo: ambiguo, no se toca ninguna.`);
  process.exit(1);
}
const cuenta = coincidencias[0];
const actual = cuenta.app_metadata ?? {};

const { data: ficha, error: errFicha } = await admin
  .from("users")
  .select("id,full_name,role,business_id")
  .eq("id", cuenta.id)
  .maybeSingle();
if (errFicha || !ficha) {
  console.error("La cuenta no tiene ficha en public.users (o no se pudo leer). No se toca nada.");
  process.exit(1);
}

const totp = await totpVerificados(admin, cuenta.id);
console.log(`Cuenta:   ${cuenta.email}  (${ficha.full_name})`);
console.log(`Claim:    role=${actual.role ?? "—"}  is_platform_admin=${actual.is_platform_admin === true}`);
console.log(`Ficha:    role=${ficha.role}`);
console.log(`TOTP verificados: ${totp ?? "?"}`);

const objetivoRol = revertir ? "admin" : "super_admin";
const objetivoFlag = !revertir;
if (!aplicar) {
  console.log(`\n(sin --apply) Se pondría: claim role=${objetivoRol}, is_platform_admin=${objetivoFlag}; ficha role=${objetivoRol}.`);
  process.exit(0);
}
if (!revertir && !(totp > 0)) {
  console.error("\nLa cuenta no tiene un TOTP verificado. Nombrar super_admin sin segundo factor no se hace.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const tecleado = await rl.question(`\nEscribe el correo para confirmar (${email}): `);
rl.close();
if (tecleado.trim().toLowerCase() !== email.trim().toLowerCase()) {
  console.error("No coincide. No se toca nada.");
  process.exit(1);
}

// 1. Claim.
const nuevoMeta = { ...actual, role: objetivoRol, is_platform_admin: objetivoFlag };
const { error: errClaim } = await admin.auth.admin.updateUserById(cuenta.id, { app_metadata: nuevoMeta });
if (errClaim) {
  console.error("No se pudo actualizar app_metadata:", errClaim.message);
  process.exit(1);
}
// 2. Ficha. Si falla (p. ej. CHECK sin ampliar), se deshace el claim.
const { error: errRol } = await admin.from("users").update({ role: objetivoRol }).eq("id", cuenta.id);
if (errRol) {
  await admin.auth.admin.updateUserById(cuenta.id, { app_metadata: actual });
  console.error(`No se pudo poner users.role='${objetivoRol}': ${errRol.message}\nSe revirtió el claim. ¿Está aplicada la migración 20260909100000?`);
  process.exit(1);
}
// 3. Rastro.
const { error: errLog } = await admin.from("audit_logs").insert({
  business_id: ficha.business_id,
  user_id: cuenta.id,
  user_name: cuenta.email,
  action: revertir ? "users.demoted_super_admin" : "users.promoted_super_admin",
  entity: "user",
  entity_id: cuenta.id,
  metadata: { ejecutado_por: "línea de comandos con service_role (fuera de la aplicación)", de: actual.role ?? null, a: objetivoRol },
});
if (errLog) console.error("⚠️  Hecho, pero NO se pudo auditar:", errLog.message);
console.log(`\nListo: ${cuenta.email} → role=${objetivoRol}, is_platform_admin=${objetivoFlag}. La persona debe cerrar sesión y volver a entrar.`);
