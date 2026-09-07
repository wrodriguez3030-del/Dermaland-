import { validatePassword } from "./password-policy";

/**
 * Genera la clave que el administrador le entrega a alguien la primera vez.
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE
 * ─────────────────────────────────
 * La alternativa real no es «que el admin invente una buena»: es «Dermaland123»
 * repetida en las ocho cuentas. Una clave generada delante, con botón de copiar,
 * quita esa tentación sin pedirle nada a quien la crea.
 *
 * FORMA: `Kx7m-Rt4p-Wq9s`
 * ─────────────────────────
 * Tres grupos de cuatro con guiones, para poder DICTARLA por teléfono sin
 * equivocarse — que es como va a viajar de verdad. El alfabeto excluye los
 * caracteres que se confunden al dictar o al leer (`0`/`O`, `1`/`l`/`I`), y se
 * garantiza mayúscula, minúscula y dígito para que pase la política de la casa.
 *
 * La aleatoriedad viene de `crypto.getRandomValues` (inyectable para poder
 * probar): `Math.random` no sirve para material de acceso.
 */

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz"; // sin l
const DIGITOS = "23456789"; // sin 0 ni 1
const ALFABETO = MAYUSCULAS + MINUSCULAS + DIGITOS;

const GRUPOS = 3;
const POR_GRUPO = 4;
const LARGO = GRUPOS * POR_GRUPO;

export type FuenteAleatoria = (n: number) => Uint8Array;

const porDefecto: FuenteAleatoria = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/**
 * Elige un carácter del alfabeto sin sesgo: se descartan los bytes que caen en
 * la cola incompleta. Un `% alfabeto.length` a secas haría los primeros
 * caracteres más probables que los últimos.
 */
function elegir(alfabeto: string, rand: FuenteAleatoria): string {
  const limite = 256 - (256 % alfabeto.length);
  // El bucle termina: cada intento tiene al menos 87% de probabilidad de valer.
  for (let intento = 0; intento < 100; intento++) {
    const b = rand(1)[0];
    if (b !== undefined && b < limite) return alfabeto[b % alfabeto.length] as string;
  }
  // Salida de emergencia si la fuente aleatoria devuelve siempre lo mismo (solo
  // pasa con una fuente falsa mal escrita en una prueba).
  return alfabeto[0] as string;
}

export function generarClaveLegible(rand: FuenteAleatoria = porDefecto): string {
  const chars: string[] = [];
  // Uno de cada clase primero, para no depender de la suerte: sin esto, una de
  // cada varios cientos de claves saldría sin dígito y la rechazaría la política.
  chars.push(elegir(MAYUSCULAS, rand), elegir(MINUSCULAS, rand), elegir(DIGITOS, rand));
  while (chars.length < LARGO) chars.push(elegir(ALFABETO, rand));

  // Barajado de Fisher-Yates para que las tres obligadas no queden siempre al
  // principio (un patrón fijo es información para quien vea muchas claves).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(1)[0]! % (i + 1);
    const a = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = a;
  }

  const grupos: string[] = [];
  for (let i = 0; i < GRUPOS; i++) grupos.push(chars.slice(i * POR_GRUPO, (i + 1) * POR_GRUPO).join(""));
  return grupos.join("-");
}

/**
 * ¿Sirve esta clave? La política de la casa MÁS la exigencia de que no lleve
 * espacios al borde: lo que se guarda en la bóveda tiene que ser exactamente lo
 * que se le fija a la cuenta, y un espacio invisible al final es la clase de
 * diferencia que nadie encuentra mirando.
 */
export function esClaveAceptable(pw: string): boolean {
  return validatePassword(pw).ok && pw === pw.trim();
}
