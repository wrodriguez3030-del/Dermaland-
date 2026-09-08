import "server-only";
import { NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { nivelAal } from "@/lib/auth/mfa-gate";
import type { AuthorizeResult } from "./require-role";

/**
 * Exige que el segundo factor se haya usado EN ESTA SESIÓN (aal2), no solo que
 * el usuario lo tenga configurado.
 *
 * POR QUÉ HACE FALTA APARTE DEL ROL
 * ─────────────────────────────────
 * Con la «computadora de confianza», un administrador entra a diario sin
 * teclear el código: la sesión se queda en aal1 y la puerta lo deja pasar a las
 * pantallas normales. Eso está bien para trabajar, pero no para las acciones
 * que pueden entregar el sistema entero: ver la clave de alguien, fijar una
 * clave nueva, cambiar un rol, cambiar los días de confianza. Ahí se pide el
 * código una vez, aunque la computadora sea de confianza.
 *
 * Sin esto, robar la galleta (o sentarse en una computadora ya abierta) daría
 * acceso al ojo de las claves. Con esto, hace falta además el teléfono.
 *
 * FALLA CERRADO
 * ─────────────
 * Si el chequeo no se puede hacer —Supabase caído, error de red, niveles
 * nulos— la respuesta es 403. Al revés que la puerta general del middleware,
 * que deja pasar a los roles no obligados para no dejar a una cajera fuera del
 * punto de venta a mitad de un turno: aquí no hay turno que salvar, y el precio
 * de equivocarse hacia el lado abierto es una clave ajena.
 *
 * El 403 lleva `code: "segundo_factor_requerido"` para que el navegador sepa
 * mandar al usuario a `/login/mfa` en vez de enseñarle «no tienes permiso»,
 * que sería mentira: permiso tiene, lo que le falta es el código.
 */
export const CODIGO_SEGUNDO_FACTOR = "segundo_factor_requerido";

function rechazo(): AuthorizeResult {
  return {
    ok: false,
    res: NextResponse.json(
      {
        error: "Esta acción pide el código de tu app de autenticación.",
        code: CODIGO_SEGUNDO_FACTOR,
      },
      { status: 403 },
    ),
  };
}

export async function requireAal2(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const sb = await createServer();
  if (!sb) return rechazo();
  try {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return rechazo();
    return nivelAal(data.currentLevel) === "aal2" ? { ok: true } : rechazo();
  } catch {
    return rechazo();
  }
}
