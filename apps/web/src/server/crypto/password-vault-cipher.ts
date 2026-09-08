import "server-only";
import {
  sealTextAesGcm,
  openTextAesGcm,
  type SealedSecret,
} from "@/features/dgii/core/certificate-encryption";

/**
 * Bóveda de claves de acceso: sellar y abrir la clave que un administrador
 * asignó a un usuario.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El dueño pidió (08/09/2026) poder asignar la clave de cada usuario y verla
 * después «con el ojo», sabiendo el riesgo. Guardarla legible en la base sería
 * regalar todas las cuentas a quien consiga una copia; guardarla aquí, sellada
 * con una llave que solo vive en el servidor, deja el volcado de la base
 * inservible por sí solo.
 *
 * Esto NO sustituye al hash de GoTrue: Supabase sigue guardando su hash y es
 * el que autentica. Esta bóveda es una copia aparte, cifrada, para el ojo del
 * administrador.
 *
 * QUÉ ATA EL SOBRE AL USUARIO
 * ───────────────────────────
 * 🔴 Se sella `{ v, uid, pw }`, no la clave a secas, y al abrir se EXIGE que el
 * `uid` del sobre sea el del usuario que se está consultando. Sin eso, copiar
 * una fila de la bóveda de un usuario a la de otro —un UPDATE torcido, una
 * restauración a medias— haría que el ojo enseñara la clave de otra persona
 * como si fuera la suya, sin un solo error.
 *
 * Se reutiliza `certificate-encryption.ts` (AES-256-GCM, IV aleatorio de 12
 * bytes, tag de 16) y NO `ai-cipher.ts`: ese hace `.trim()` a lo que guarda
 * —una clave con un espacio al final se guardaría distinta de la que fija
 * GoTrue— y devuelve los últimos cuatro caracteres, que aquí serían cuatro
 * caracteres de una contraseña fuera de la caja fuerte.
 *
 * La llave va aparte de las otras dos del sistema (`DGII_CERT_ENCRYPTION_KEY`,
 * `AI_CREDENTIALS_ENCRYPTION_KEY`): que se filtre una no debe abrir las tres.
 */

const KEY_BYTES = 32;

/** Fallo de configuración o de apertura. NUNCA incluye la clave ni el sobre. */
export class BovedaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BovedaError";
  }
}

/** Lo que se sella. `v` deja la puerta abierta a cambiar el formato sin adivinar. */
interface SobreClave {
  v: 1;
  uid: string;
  pw: string;
}

/**
 * Lee y valida `USER_PASSWORD_VAULT_KEY` (32 bytes en base64).
 *
 * Se lee de `process.env` en cada llamada, como `getDgiiEncryptionKeyFromEnv`:
 * así rotar la llave no exige reiniciar el proceso, y las pruebas pueden
 * ponerla y quitarla.
 */
export function getVaultKeyOrThrow(): Buffer {
  const raw = process.env.USER_PASSWORD_VAULT_KEY;
  if (!raw || raw.trim() === "") {
    throw new BovedaError(
      "La bóveda de claves no está configurada (falta USER_PASSWORD_VAULT_KEY).",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new BovedaError("USER_PASSWORD_VAULT_KEY no es base64 válido.");
  }
  if (key.length !== KEY_BYTES) {
    throw new BovedaError(
      `USER_PASSWORD_VAULT_KEY debe ser 32 bytes en base64 (recibidos ${key.length}).`,
    );
  }
  return key;
}

/** ¿Está la bóveda configurada? Para decidir SIN lanzar (la pantalla lo pregunta). */
export function bovedaConfigurada(): boolean {
  try {
    getVaultKeyOrThrow();
    return true;
  } catch {
    return false;
  }
}

/** Sella la clave de `uid`. El sobre resultante no sirve para ningún otro usuario. */
export function sellarClave(uid: string, pw: string): SealedSecret {
  if (!uid) throw new BovedaError("Falta el usuario al sellar la clave.");
  if (!pw) throw new BovedaError("No se sella una clave vacía.");
  const sobre: SobreClave = { v: 1, uid, pw };
  return sealTextAesGcm(JSON.stringify(sobre), getVaultKeyOrThrow());
}

/**
 * Abre el sobre de `uid`. Lanza si la llave no es la que lo selló, si el
 * contenido no tiene la forma esperada, o si el sobre pertenece a OTRO usuario.
 */
export function abrirClave(sealed: SealedSecret, uid: string): string {
  if (!uid) throw new BovedaError("Falta el usuario al abrir la clave.");
  let crudo: string;
  try {
    crudo = openTextAesGcm(sealed, getVaultKeyOrThrow());
  } catch {
    // El error de abajo puede llevar detalles del criptógrafo; se sustituye por
    // uno propio para no arrastrar nada del sobre a un log.
    throw new BovedaError("No se pudo abrir la clave guardada (¿cambió la llave del servidor?).");
  }
  let sobre: unknown;
  try {
    sobre = JSON.parse(crudo);
  } catch {
    throw new BovedaError("La clave guardada no tiene el formato esperado.");
  }
  if (
    typeof sobre !== "object" ||
    sobre === null ||
    !("uid" in sobre) ||
    !("pw" in sobre) ||
    typeof (sobre as SobreClave).pw !== "string"
  ) {
    throw new BovedaError("La clave guardada no tiene el formato esperado.");
  }
  const s = sobre as SobreClave;
  // 🔴 La comprobación que impide enseñar la clave de otra persona.
  if (s.uid !== uid) {
    throw new BovedaError("La clave guardada pertenece a otro usuario.");
  }
  return s.pw;
}
