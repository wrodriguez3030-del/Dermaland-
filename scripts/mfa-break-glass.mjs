#!/usr/bin/env node
/**
 * Break-glass de 2FA: retira el segundo factor de UN usuario nombrado.
 *
 * Existe porque DermaLand no tiene un administrador de reserva: los únicos
 * usuarios con `role: admin` pertenecen al mismo dueño. Si pierde el teléfono
 * después de enrolarse, la puerta de 2FA (`lib/auth/mfa-gate.ts`) lo deja fuera
 * de su propio sistema y no hay nadie más que pueda entrar a abrirle.
 *
 * Deliberadamente NO se implementaron códigos de recuperación: serían
 * criptografía casera con almacenamiento propio, más superficie de ataque que
 * la que eliminan. Esto corre FUERA de la aplicación, con la `service_role` que
 * sólo tiene el dueño, y deja rastro en `audit_logs`: la operación es visible,
 * no silenciosa.
 *
 * Orden de las cosas, y no es cosmético: TODO lo que hace falta para poder
 * auditar (negocio válido, ficha del usuario) se resuelve ANTES de borrar el
 * primer factor. `audit_logs.business_id` es NOT NULL con clave foránea a
 * `businesses`, y `audit_logs.user_id` la tiene a `public.users`, que NO se
 * crea sola con el usuario de Auth. Resolverlo después sería descubrir que el
 * rastro es imposible justo cuando el factor ya no existe.
 *
 * Uso:
 *   node scripts/mfa-break-glass.mjs <correo>
 *   node scripts/mfa-break-glass.mjs <correo> --dry-run
 *   node scripts/mfa-break-glass.mjs <correo> --motivo "teléfono robado"
 */
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uso(codigo) {
  const salida = codigo === 0 ? console.log : console.error;
  salida(`
Break-glass de 2FA — retira el segundo factor de UN usuario.

  node scripts/mfa-break-glass.mjs <correo> [opciones]

Opciones:
  --dry-run             Muestra qué haría y NO cambia nada.
  --motivo "<texto>"    Queda registrado en la auditoría.
  --business-id <uuid>  Negocio al que se atribuye el registro de auditoría.
                        Sólo si el usuario no lo tiene ni en sus claims ni en
                        su ficha; el guion te lo pedirá si hace falta.
  -h, --help            Esta ayuda.

Retira el factor de un solo usuario nombrado. Nunca de varios, nunca por patrón.
Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (del entorno o de
apps/web/.env.local).
`);
  process.exit(codigo);
}

// ── Argumentos ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let correo = null;
let seco = false;
let motivo = null;
let negocioManual = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") uso(0);
  else if (a === "--dry-run" || a === "--simulacro") seco = true;
  else if (a.startsWith("--motivo=")) motivo = a.slice("--motivo=".length);
  else if (a === "--motivo") motivo = args[++i];
  else if (a.startsWith("--business-id="))
    negocioManual = a.slice("--business-id=".length);
  else if (a === "--business-id") negocioManual = args[++i];
  else if (a.startsWith("-")) {
    console.error(`Opción desconocida: ${a}`);
    uso(1);
  } else if (correo === null) correo = a;
  else {
    console.error(
      `Sobra el argumento "${a}". Este guion retira el factor de UN usuario a la vez, a propósito.`,
    );
    process.exit(1);
  }
}

if (!correo) uso(1);

// Un correo, no una selección. `%` y `*` no son parte de ninguna dirección real
// y sí son lo que uno teclea cuando quiere alcanzar a varios de un golpe.
if (!correo.includes("@") || /[%*,\s]/.test(correo)) {
  console.error(
    `"${correo}" no es un correo. Este guion no acepta patrones ni listas: un usuario nombrado, uno solo.`,
  );
  process.exit(1);
}
if (negocioManual !== null && !UUID.test(negocioManual)) {
  console.error("--business-id debe ser un UUID.");
  process.exit(1);
}

// ── Entorno (nunca se imprime el valor de ninguna clave) ─────────────────────
let cacheEnv = null;
function env(clave) {
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

const admin = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Busca por correo recorriendo TODAS las páginas.
 *
 * `listUsers` pagina de a 50 por defecto y nunca avisa de que se quedó corta:
 * pedir una sola página haría que el guion respondiera "no existe ese usuario"
 * a quien está encerrado fuera del sistema.
 */
async function buscarPorCorreo(objetivo) {
  const buscado = objetivo.trim().toLowerCase();
  const coincidencias = [];
  const porPagina = 200;
  for (let pagina = 1; pagina <= 100; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pagina,
      perPage: porPagina,
    });
    if (error) {
      console.error("No se pudo listar usuarios:", error.message);
      process.exit(1);
    }
    const usuarios = data?.users ?? [];
    for (const u of usuarios) {
      if (u.email?.trim().toLowerCase() === buscado) coincidencias.push(u);
    }
    if (usuarios.length < porPagina) break;
  }
  return coincidencias;
}

const coincidencias = await buscarPorCorreo(correo);
if (coincidencias.length === 0) {
  console.error(`No existe ningún usuario con el correo ${correo}.`);
  process.exit(1);
}
if (coincidencias.length > 1) {
  console.error(
    `Hay ${coincidencias.length} usuarios con el correo ${correo}. Ambiguo: no se toca ninguno.`,
  );
  process.exit(1);
}
const usuario = coincidencias[0];

// ── Factores ─────────────────────────────────────────────────────────────────
const { data: factores, error: errFac } = await admin.auth.admin.mfa.listFactors(
  { userId: usuario.id },
);
if (errFac) {
  console.error("No se pudieron leer los factores:", errFac.message);
  process.exit(1);
}
const lista = factores?.factors ?? [];
if (lista.length === 0) {
  console.log(`${correo} no tiene ningún segundo factor. Nada que retirar.`);
  process.exit(0);
}

// ── Auditoría: resolver AHORA, no después de borrar ──────────────────────────
/**
 * De dónde sale el `business_id` del registro, en orden de confianza:
 *   1. `--business-id` (lo escribió una persona a propósito),
 *   2. `app_metadata.business_id` (la fuente de autoridad de la app),
 *   3. la ficha en `public.users` (por si los claims quedaron incompletos).
 * Si ninguna responde, se aborta ANTES de tocar el factor: un break-glass sin
 * rastro es exactamente lo que este guion no puede permitirse.
 */
const claimNegocio = usuario.app_metadata?.business_id;
const { data: ficha, error: errFicha } = await admin
  .from("users")
  .select("id, full_name, business_id, role")
  .eq("id", usuario.id)
  .maybeSingle();
if (errFicha) {
  console.error("No se pudo leer la ficha del usuario:", errFicha.message);
  process.exit(1);
}

let negocioId = null;
let origenNegocio = "";
if (negocioManual) {
  negocioId = negocioManual;
  origenNegocio = "indicado con --business-id";
} else if (typeof claimNegocio === "string" && UUID.test(claimNegocio)) {
  negocioId = claimNegocio;
  origenNegocio = "claims del usuario";
} else if (ficha?.business_id && UUID.test(ficha.business_id)) {
  negocioId = ficha.business_id;
  origenNegocio = "ficha del usuario";
}

if (!negocioId) {
  console.error(
    `\n${correo} no tiene negocio ni en sus claims ni en su ficha, y la auditoría lo exige.`,
  );
  console.error(
    "No se retiró ningún factor. Vuelve a correrlo con --business-id <uuid> del negocio al que pertenece.",
  );
  process.exit(1);
}

const { data: negocio, error: errNeg } = await admin
  .from("businesses")
  .select("id, commercial_name, legal_name")
  .eq("id", negocioId)
  .maybeSingle();
if (errNeg) {
  console.error("No se pudo verificar el negocio:", errNeg.message);
  process.exit(1);
}
if (!negocio) {
  console.error(
    `\nEl negocio (${origenNegocio}) no existe en la base. La auditoría fallaría.`,
  );
  console.error("No se retiró ningún factor.");
  process.exit(1);
}

// `audit_logs.user_id` apunta a `public.users`, que NO se crea sola con el
// usuario de Auth. Sin ficha, la columna va nula (es opcional) y el rastro se
// sostiene con el correo en `user_name`: preferible a que el INSERT reviente
// por clave foránea con el factor ya retirado.
const usuarioAuditoria = ficha?.id ?? null;

// ── Resumen y confirmación ───────────────────────────────────────────────────
const rolClaim = usuario.app_metadata?.role ?? "(sin rol)";
console.log(`\nUsuario:  ${correo}`);
console.log(`Nombre:   ${ficha?.full_name ?? "(sin ficha en el sistema)"}`);
console.log(
  `Rol:      ${rolClaim}${ficha && ficha.role !== rolClaim ? ` (la ficha dice "${ficha.role}")` : ""}`,
);
console.log(`Negocio:  ${negocio.commercial_name ?? negocio.legal_name} — ${origenNegocio}`);
console.log(
  `Factores: ${lista.map((f) => `${f.friendly_name ?? f.factor_type} (${f.status})`).join(", ")}`,
);
console.log(
  "\nRetirarlos le permitirá entrar SOLO con contraseña hasta que vuelva a enrolarse.",
);

if (seco) {
  console.log(
    `\n[--dry-run] Se retirarían ${lista.length} factor(es) y se registraría "user.mfa_break_glass" en la auditoría.`,
  );
  console.log("[--dry-run] No se cambió nada.");
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await rl.question(
  `\nEscribe el correo completo para confirmar: `,
);
rl.close();

if (respuesta.trim().toLowerCase() !== correo.trim().toLowerCase()) {
  console.error("Confirmación no coincide. Cancelado. No se cambió nada.");
  process.exit(1);
}

// ── Retirar ──────────────────────────────────────────────────────────────────
const retirados = [];
for (const f of lista) {
  const { error } = await admin.auth.admin.mfa.deleteFactor({
    userId: usuario.id,
    id: f.id,
  });
  if (error) {
    console.error(`Fallo al retirar un factor: ${error.message}`);
    if (retirados.length > 0) {
      console.error(
        `Ya se habían retirado ${retirados.length} de ${lista.length}: el usuario quedó a medias. Vuelve a correrlo.`,
      );
    }
    process.exit(1);
  }
  retirados.push(f);
  console.log(`Factor retirado: ${f.friendly_name ?? f.factor_type}`);
}

// ── El rastro importa tanto como la operación ────────────────────────────────
// Sin UUID ni JSON crudo en `metadata`: la pantalla de Auditoría lo muestra tal
// cual a un usuario de negocio.
const metadata = {
  factores_retirados: retirados.length,
  motivo: motivo?.trim() || "break-glass ejecutado desde la línea de comandos",
  ejecutado_por: "línea de comandos con service_role (fuera de la aplicación)",
};
if (!usuarioAuditoria) {
  metadata.nota =
    "El usuario no tiene ficha en el sistema; el registro queda sin enlace.";
}

const registro = {
  business_id: negocioId,
  user_id: usuarioAuditoria,
  user_name: correo,
  action: "user.mfa_break_glass",
  entity: "user",
  entity_id: usuario.id,
  metadata,
};

const { error: errLog } = await admin.from("audit_logs").insert(registro);

console.log(
  `\n✅ ${correo} puede entrar con contraseña. Debe volver a enrolar 2FA en /perfil/seguridad.`,
);

// Se avisa al final y a gritos porque es lo último que queda en pantalla: un
// break-glass sin registro es la única forma de que esto se vuelva peligroso.
if (errLog) {
  console.error(
    "\n⚠️  AVISO: el factor se retiró pero NO se pudo auditar:",
    errLog.message,
  );
  console.error("Regístralo a mano; la operación no puede quedar invisible:");
  console.error(JSON.stringify(registro, null, 2));
  process.exitCode = 1;
} else {
  console.log("Registrado en auditoría.");
}
