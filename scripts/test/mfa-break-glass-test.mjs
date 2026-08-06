#!/usr/bin/env node
/**
 * Prueba de verdad `scripts/mfa-break-glass.mjs`.
 *
 * Un guion de emergencia que nadie ha ejecutado no es una red: es una promesa.
 * Y no se puede ensayar contra las cuentas reales —habría que enrolarles un
 * factor primero—, así que esto crea usuarios DESECHABLES, les enrola un TOTP
 * de verdad (challenge + verify con un código generado localmente) y corre el
 * guion como proceso aparte, igual que lo correría el dueño. Autolimpiante:
 * todo lo que crea lo borra al final, pase lo que pase.
 *
 * Lo que comprueba, y por qué cada cosa:
 *   - correo inexistente / patrón / dos correos → se niega y no toca nada
 *   - --dry-run y confirmación equivocada → el factor SIGUE ahí
 *   - camino feliz → el factor desaparece Y queda la fila en `audit_logs`
 *   - después del break-glass se entra SOLO con contraseña (el objetivo entero)
 *   - usuario sin ficha en `public.users` → se audita igual (user_id nulo), que
 *     es donde la clave foránea de `audit_logs.user_id` reventaría el rastro
 *   - usuario sin negocio → aborta ANTES de retirar el factor, porque un
 *     break-glass sin registro es peor que uno que no se pudo hacer
 *
 * ⚠️  ESTO ESCRIBE EN LA BASE A LA QUE APUNTE `apps/web/.env.local`, QUE HOY ES
 * PRODUCCIÓN. No toca ninguna cuenta real —crea las suyas y las borra—, pero
 * "no toca cuentas reales" no es lo mismo que "no escribe": durante la corrida
 * inserta un negocio en `businesses`, 3 usuarios en `auth.users` y en
 * `public.users`, 3 factores TOTP en `auth.mfa_factors`, filas en `audit_logs`,
 * y al final las borra (el DELETE de `audit_logs` va acotado al negocio que él
 * mismo creó).
 *
 * Por eso exige confirmación explícita nombrando el proyecto, igual que el
 * resto de los guiones que pueden tocar datos de verdad. Uso:
 *
 *   DERMALAND_BREAK_GLASS_TEST_CONFIRM=<ref-del-proyecto> \
 *     node scripts/test/mfa-break-glass-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const GUION = path.join(root, "scripts", "mfa-break-glass.mjs");

const env = {};
try {
  for (const line of readFileSync(path.join(root, "apps/web/.env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("ABORTADO: no se pudo leer apps/web/.env.local, que es de donde sale el proyecto destino.");
  process.exit(1);
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Guarda deny-by-default ──────────────────────────────────────────────────
// Este era el único guion de la rama que escribía en producción sin la
// disciplina de todos sus hermanos (`DERMALAND_DR_CONFIRM` en el simulacro y en
// el restore, confirmación tecleada en `mfa-break-glass.mjs`): leía .env.local
// sin preguntar, se hacía un cliente `service_role` y empezaba a insertar. Un
// `node scripts/test/mfa-break-glass-test.mjs` de más —copiado de la
// documentación, que además lo pedía "antes de cualquier cambio en el
// enforcement de 2FA"— escribía en la base real sin una sola confirmación.
//
// La confirmación es el REF DEL PROYECTO, no un "si": obliga a mirar a dónde
// apunta el .env.local antes de correrlo. Escribir mal el ref no destruye
// nada; correrlo sin mirar, sí puede.
if (!URL_ || !ANON || !SRK) {
  console.error(
    "ABORTADO: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / " +
      "SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local.",
  );
  process.exit(1);
}
const REF_DESTINO = URL_.replace(/^https?:\/\//, "").split(".")[0];
if ((process.env.DERMALAND_BREAK_GLASS_TEST_CONFIRM ?? "") !== REF_DESTINO) {
  console.error(
    `ABORTADO: esta prueba ESCRIBE en el proyecto "${REF_DESTINO}" (${URL_}).\n` +
      "  Crea y borra sus propios datos —no toca cuentas reales—, pero durante la corrida\n" +
      "  inserta un negocio, 3 usuarios de Auth con TOTP enrolado (auth.mfa_factors) y sus\n" +
      "  fichas, escribe en audit_logs y al final borra todo eso.\n\n" +
      "  Si ese proyecto es el que quieres tocar, confirmalo nombrandolo:\n" +
      `    DERMALAND_BREAK_GLASS_TEST_CONFIRM=${REF_DESTINO} node scripts/test/mfa-break-glass-test.mjs`,
  );
  process.exit(1);
}

const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);

// ── TOTP (RFC 6238) — mismo enfoque que scripts/test/mfa-enroll-test.mjs ─────
function base32Decode(b32) {
  const alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of b32.replace(/=+$/, "").toUpperCase()) {
    const v = alph.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretB32, forTime = Date.now()) {
  const key = base32Decode(secretB32);
  const counter = Math.floor(forTime / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const bad = (n, e = "") => { fail++; console.log(`  ❌ ${n} ${e}`); };

/** Corre el break-glass como lo correría una persona, con lo que teclearía. */
function correr(args, tecleado = "") {
  const r = spawnSync(process.execPath, [GUION, ...args], {
    input: tecleado,
    encoding: "utf8",
    cwd: root,
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

async function factoresDe(userId) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`listFactors: ${error.message}`);
  return data?.factors ?? [];
}

/** Crea usuario de Auth + (opcional) ficha, y le deja un TOTP VERIFICADO. */
async function crearUsuarioConFactor({ sufijo, bizId, conFicha, conClaimNegocio }) {
  const email = `bgtest-${stamp}-${sufijo}@example.com`;
  const password = `Bg!${stamp}${sufijo}Aa9`;
  const app_metadata = { role: "admin", is_platform_admin: false };
  if (conClaimNegocio) app_metadata.business_id = bizId;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata,
  });
  if (error) throw new Error(`createUser ${sufijo}: ${error.message}`);
  const id = data.user.id;

  if (conFicha) {
    const { error: e2 } = await admin.from("users").insert({
      id, business_id: bizId, email, full_name: `Break Glass ${sufijo}`, role: "admin",
    });
    if (e2) throw new Error(`ficha ${sufijo}: ${e2.message}`);
  }

  const c = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: false } });
  if ((await c.auth.signInWithPassword({ email, password })).error) throw new Error(`login ${sufijo}`);
  const enroll = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `bg-${sufijo}` });
  if (enroll.error) throw new Error(`enroll ${sufijo}: ${enroll.error.message}`);
  const ch = await c.auth.mfa.challenge({ factorId: enroll.data.id });
  if (ch.error) throw new Error(`challenge ${sufijo}: ${ch.error.message}`);
  const vr = await c.auth.mfa.verify({
    factorId: enroll.data.id, challengeId: ch.data.id, code: totp(enroll.data.totp.secret),
  });
  if (vr.error) throw new Error(`verify ${sufijo}: ${vr.error.message}`);

  return { id, email, password };
}

async function run() {
  const limpiar = { usuarios: [], biz: null };
  try {
    console.log("── Setup: negocio y usuarios desechables ──");
    const { data: biz, error: errBiz } = await admin.from("businesses").insert({
      legal_name: `BGTEST ${stamp}`, commercial_name: `BGTEST ${stamp}`, rnc: `BG${stamp}`,
      plan_id: "00000000-0000-0000-0000-000000000001", status: "trial",
    }).select("id").single();
    if (errBiz) throw new Error(`businesses: ${errBiz.message}`);
    limpiar.biz = biz.id;

    const conFicha = await crearUsuarioConFactor({ sufijo: "ficha", bizId: biz.id, conFicha: true, conClaimNegocio: true });
    limpiar.usuarios.push(conFicha.id);
    const sinFicha = await crearUsuarioConFactor({ sufijo: "sinficha", bizId: biz.id, conFicha: false, conClaimNegocio: true });
    limpiar.usuarios.push(sinFicha.id);
    const sinNegocio = await crearUsuarioConFactor({ sufijo: "sinbiz", bizId: biz.id, conFicha: false, conClaimNegocio: false });
    limpiar.usuarios.push(sinNegocio.id);
    console.log("  3 usuarios con TOTP verificado");

    console.log("\n── Se niega sin tocar nada ──");
    {
      const r = correr([`no-existe-${stamp}@example.com`], "x\n");
      r.code === 1 && /No existe ning/i.test(r.out)
        ? ok("correo inexistente → código 1")
        : bad("correo inexistente", `code=${r.code}`);
    }
    {
      const r = correr(["%@example.com"], "x\n");
      r.code === 1 && /patrones/i.test(r.out)
        ? ok("patrón con % → rechazado antes de consultar nada")
        : bad("patrón", `code=${r.code}`);
    }
    {
      const r = correr([conFicha.email, sinFicha.email], "x\n");
      r.code === 1 && /UN usuario a la vez/i.test(r.out)
        ? ok("dos correos → rechazado (nunca varios)")
        : bad("dos correos", `code=${r.code}`);
    }
    {
      const r = correr([conFicha.email, "--dry-run"], "");
      const quedan = await factoresDe(conFicha.id);
      r.code === 0 && quedan.length === 1
        ? ok("--dry-run informa y el factor sigue en su sitio")
        : bad("--dry-run", `code=${r.code} factores=${quedan.length}`);
    }
    {
      const r = correr([conFicha.email], "otra-cosa@example.com\n");
      const quedan = await factoresDe(conFicha.id);
      r.code === 1 && quedan.length === 1
        ? ok("confirmación equivocada → cancelado, el factor sigue")
        : bad("confirmación equivocada", `code=${r.code} factores=${quedan.length}`);
    }

    console.log("\n── Camino feliz: retira y deja rastro ──");
    {
      const r = correr([conFicha.email, "--motivo", "prueba automatizada"], `${conFicha.email}\n`);
      const quedan = await factoresDe(conFicha.id);
      r.code === 0 && quedan.length === 0
        ? ok("factor retirado")
        : bad("no retiró el factor", `code=${r.code} factores=${quedan.length}\n${r.out}`);

      const { data: filas } = await admin.from("audit_logs")
        .select("*").eq("business_id", limpiar.biz).eq("action", "user.mfa_break_glass");
      const fila = (filas ?? []).find((f) => f.user_name === conFicha.email);
      if (!fila) bad("no quedó registro en audit_logs");
      else {
        fila.entity === "user" && fila.entity_id === conFicha.id && fila.user_id === conFicha.id
          ? ok("audit_logs: entidad, id y usuario correctos")
          : bad("audit_logs con campos raros", JSON.stringify(fila));
        fila.metadata?.motivo === "prueba automatizada" && fila.metadata?.factores_retirados === 1
          ? ok("audit_logs: motivo y conteo en metadata")
          : bad("metadata incompleta", JSON.stringify(fila.metadata));
        Object.values(fila.metadata ?? {}).every((v) => typeof v !== "object")
          ? ok("metadata sin JSON anidado (la pantalla la muestra tal cual)")
          : bad("metadata con objetos anidados");
      }
    }

    console.log("\n── Lo que el break-glass promete: entrar solo con contraseña ──");
    {
      const c = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: false } });
      const login = await c.auth.signInWithPassword({ email: conFicha.email, password: conFicha.password });
      const aal = login.error ? null : (await c.auth.mfa.getAuthenticatorAssuranceLevel()).data;
      !login.error && aal?.currentLevel === "aal1" && aal?.nextLevel === "aal1"
        ? ok("entra con contraseña y la sesión ya no exige desafío (aal1/aal1 → la puerta lo manda a enrolarse)")
        : bad("no recuperó el acceso", JSON.stringify(aal ?? login.error?.message));
      const { data: fl } = await c.auth.mfa.listFactors();
      (fl?.totp?.length ?? 0) === 0 ? ok("ya no le figura ningún TOTP") : bad("sigue viendo factores");
    }

    console.log("\n── Idempotente: correrlo dos veces no inventa un segundo registro ──");
    {
      const { count: antes } = await admin.from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("business_id", limpiar.biz).eq("action", "user.mfa_break_glass");
      const r = correr([conFicha.email], `${conFicha.email}\n`);
      const { count: despues } = await admin.from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("business_id", limpiar.biz).eq("action", "user.mfa_break_glass");
      r.code === 0 && /Nada que retirar/i.test(r.out) && antes === despues
        ? ok("sin factores → sale limpio y no registra nada")
        : bad("segunda corrida", `code=${r.code} ${antes}→${despues}`);
    }

    console.log("\n── Usuario sin ficha en public.users (la clave foránea que rompe el rastro) ──");
    {
      const r = correr([sinFicha.email], `${sinFicha.email}\n`);
      const quedan = await factoresDe(sinFicha.id);
      r.code === 0 && quedan.length === 0
        ? ok("factor retirado aunque no tenga ficha")
        : bad("sin ficha: no retiró", `code=${r.code}\n${r.out}`);
      const { data: filas } = await admin.from("audit_logs")
        .select("*").eq("business_id", limpiar.biz).eq("user_name", sinFicha.email);
      const fila = (filas ?? [])[0];
      fila && fila.user_id === null
        ? ok("se auditó con user_id nulo en vez de reventar por clave foránea")
        : bad("sin ficha: auditoría", JSON.stringify(fila ?? null));
    }

    console.log("\n── Usuario sin negocio: aborta ANTES de destruir ──");
    {
      const r = correr([sinNegocio.email], `${sinNegocio.email}\n`);
      const quedan = await factoresDe(sinNegocio.id);
      r.code === 1 && quedan.length === 1 && /No se retiró ningún factor/i.test(r.out)
        ? ok("sin negocio → se niega y el factor sigue intacto")
        : bad("sin negocio", `code=${r.code} factores=${quedan.length}\n${r.out}`);
    }
    {
      const r = correr([sinNegocio.email, "--business-id", limpiar.biz], `${sinNegocio.email}\n`);
      const quedan = await factoresDe(sinNegocio.id);
      r.code === 0 && quedan.length === 0
        ? ok("--business-id destraba el caso y retira el factor")
        : bad("--business-id", `code=${r.code} factores=${quedan.length}\n${r.out}`);
    }

    console.log(`\n── Resultado: ${pass} OK, ${fail} FALLOS ──`);
  } finally {
    console.log("\n── Cleanup ──");
    if (limpiar.biz) await admin.from("audit_logs").delete().eq("business_id", limpiar.biz);
    for (const id of limpiar.usuarios) {
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    if (limpiar.biz) await admin.from("businesses").delete().eq("id", limpiar.biz);
    console.log("  datos de prueba eliminados");
  }
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
