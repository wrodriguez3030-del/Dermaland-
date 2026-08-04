// ¿Esta ficha de cliente es la MISMA persona?
//
// La tienda crea fichas sola, sin nadie mirando. Eso obliga a escribir la regla
// entera, porque en el mostrador siempre hay alguien que puede decir "no, ese
// es el hermano" y aquí no.
//
// Dos fallos posibles, y NO cuestan lo mismo:
//
//   · Crear una ficha de más → el historial de compras del cliente se parte en
//     dos. Molesto. Se arregla fusionando.
//   · Meter la compra en la ficha de OTRO → la persona equivocada carga con una
//     compra que no hizo. Eso ya no se arregla mirando la pantalla, porque a
//     simple vista no se ve que esté mal.
//
// Por eso el número de teléfono NO basta para dar por buena una ficha. En esta
// misma base hay dos personas distintas con el mismo número: un padre y su
// hijo comparten la línea de casa. El nombre tiene que ser compatible también.

import { normalizeEmail, normalizePhone } from "./customer-normalization";

/** Ficha candidata, con lo justo para decidir. */
export interface ClientCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** Ya normalizados por la base (columnas generadas de `clients`). */
  phoneDigits: string | null;
  whatsappDigits: string | null;
  emailNormalized: string | null;
  /** Para desempatar: ante dos iguales gana la más antigua, la establecida. */
  createdAt: string;
}

/** Quién dice ser el que compra. */
export interface IncomingIdentity {
  fullName: string;
  phone: string;
  email?: string | null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palabras del nombre, sin tildes, en minúscula y sin iniciales sueltas. */
export function nameTokens(value: string | null | undefined): string[] {
  return sinTildes((value ?? "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1); // "R" de "WILLIAN R RODRIGUEZ" no aporta nada
}

/**
 * ¿Los dos nombres pueden ser de la misma persona?
 *
 * No exige que sean iguales: el mostrador escribe "WILLIAN R RODRIGUEZ" y la
 * tienda "Willian Rodriguez", y son el mismo señor. Basta con que todas las
 * palabras del más corto estén en el más largo.
 *
 * Lo que SÍ rechaza es lo que importa: "María Rodríguez" contra "Willian
 * Rodríguez" comparten el apellido y nada más, así que no.
 */
export function namesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const enLargo = new Set(largo);
  return corto.every((t) => enLargo.has(t));
}

export type MatchReason = "correo" | "telefono";

export interface ClientMatch {
  id: string;
  reason: MatchReason;
}

/**
 * De todas las fichas que comparten teléfono o correo, ¿cuál es esta persona?
 *
 * El CORREO manda sobre el teléfono. Una casa comparte la línea; una bandeja de
 * entrada no. Un correo igual es la misma persona, y ahí ni se mira el nombre:
 * la gente se casa, se apellida distinto en cada sitio y escribe su nombre de
 * cinco maneras.
 *
 * Por TELÉFONO hace falta además que el nombre encaje, y si empatan varias gana
 * la más antigua: es la que lleva el historial.
 *
 * Devolver `null` significa "no me consta", y el llamador creará una ficha
 * nueva. Eso es lo correcto ante la duda: una ficha de más se fusiona, una
 * compra en la ficha de otro no se ve.
 */
export function pickClientMatch(
  candidatos: readonly ClientCandidate[],
  identidad: IncomingIdentity,
): ClientMatch | null {
  const correo = normalizeEmail(identidad.email);
  const telefono = normalizePhone(identidad.phone);

  const porFecha = [...candidatos].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  if (correo) {
    const porCorreo = porFecha.find((c) => c.emailNormalized === correo);
    if (porCorreo) return { id: porCorreo.id, reason: "correo" };
  }

  if (telefono) {
    const mismoNumero = porFecha.filter(
      (c) => c.phoneDigits === telefono || c.whatsappDigits === telefono,
    );
    const conNombre = mismoNumero.find((c) =>
      namesCompatible(
        `${c.firstName ?? ""} ${c.lastName ?? ""}`,
        identidad.fullName,
      ),
    );
    if (conNombre) return { id: conNombre.id, reason: "telefono" };
  }

  return null;
}
