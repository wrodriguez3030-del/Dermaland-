/**
 * La galleta de «esta computadora es de confianza»: cómo se arma, cómo se lee
 * y cómo se convierte en el hash que guarda la base.
 *
 * QUÉ HAY DENTRO Y QUÉ NO
 * ───────────────────────
 * La galleta lleva un identificador de fila (16 bytes) y un SECRETO (32 bytes),
 * los dos aleatorios. En la base se guarda SOLO el sha256 del secreto: quien
 * consiga leer `trusted_devices` —un volcado, una consulta de más— no puede
 * fabricar una galleta válida con lo que ve. Es la misma idea que un hash de
 * contraseña, aplicada a un vale de sesión.
 *
 * UNA GALLETA POR USUARIO
 * ───────────────────────
 * El nombre lleva los primeros ocho caracteres del id del usuario. En el
 * mostrador varias personas usan la misma computadora: con un nombre único, la
 * de la segunda pisaría la de la primera y la primera volvería a tener que
 * teclear el código sin saber por qué.
 *
 * SIN `node:crypto`
 * ─────────────────
 * Esto corre en el middleware, que va en el runtime Edge. `node:crypto` no
 * existe allí; se usa `globalThis.crypto.subtle`, que sí. Por eso tampoco se
 * reutiliza `share-token.ts`, que sí depende de Node.
 */

/** Prefijo del nombre de la galleta. El sufijo son 8 caracteres del id del usuario. */
const PREFIJO = "dl_td_";

const BYTES_ID = 16;
const BYTES_SECRETO = 32;

/**
 * Nombre de la galleta de este usuario.
 *
 * 🔴 Tolera un id ausente devolviendo cadena vacía en vez de reventar. Esto
 * corre en el middleware, en CADA petición: una excepción aquí no rompe una
 * pantalla, deja el sistema entero sin responder. Y una cadena vacía no nombra
 * ninguna galleta, así que el efecto es «no hay computadora de confianza», que
 * es el lado seguro.
 */
export function nombreGalleta(userId: string | null | undefined): string {
  if (typeof userId !== "string" || userId === "") return "";
  return PREFIJO + userId.replace(/-/g, "").slice(0, 8);
}

/** base64url sin `Buffer` (no existe en Edge). */
function aBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array | null {
  try {
    const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export interface Dispositivo {
  /** Identificador de la fila en `trusted_devices`, en hexadecimal con guiones (uuid). */
  deviceId: string;
  /** El secreto en crudo. NUNCA se guarda; solo se compara su hash. */
  secreto: Uint8Array;
}

/** Genera un dispositivo nuevo: id de fila + secreto. */
export function nuevoDispositivo(
  rand: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
): Dispositivo {
  const id = rand(BYTES_ID);
  return { deviceId: aUuid(id), secreto: rand(BYTES_SECRETO) };
}

/** 16 bytes → uuid con guiones, que es lo que espera la columna `uuid` de Postgres. */
function aUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Valor de la galleta: `<deviceId>.<secreto en base64url>`. */
export function codificar(d: Dispositivo): string {
  return `${d.deviceId}.${aBase64Url(d.secreto)}`;
}

export function parsear(valor: string | undefined | null): Dispositivo | null {
  if (!valor) return null;
  const punto = valor.indexOf(".");
  if (punto <= 0) return null;
  const deviceId = valor.slice(0, punto);
  // El id tiene que ser un uuid: si no, ni se consulta la base.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) return null;
  const secreto = deBase64Url(valor.slice(punto + 1));
  if (!secreto || secreto.length !== BYTES_SECRETO) return null;
  return { deviceId, secreto };
}

/** sha256 en hexadecimal, que es lo que guarda `trusted_devices.token_hash`. */
export async function hashSecreto(secreto: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", secreto as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
