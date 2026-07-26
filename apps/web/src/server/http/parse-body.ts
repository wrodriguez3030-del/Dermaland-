import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

/**
 * Valida el body JSON de un route handler contra un esquema Zod (Regla 2:
 * validar tipo/longitud/formato en el SERVIDOR antes de usar). Devuelve los
 * datos ya validados o una `NextResponse` 422/400 lista para retornar.
 *
 * `data` se expone como `any` a propósito: es el MISMO contrato que tenía
 * `await req.json()` en estos handlers (que ya lo pasan a repositorios con tipos
 * propios + whitelisting de columnas). La garantía nueva es el chequeo en
 * RUNTIME del esquema; el tipado de compilación lo sigue aportando el repo.
 *
 * NO reemplaza el aislamiento por `business_id` (siempre del JWT) ni el
 * whitelisting del repositorio; los complementa.
 */
export type ParseBodyResult =
  | {
      ok: true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    }
  | { ok: false; res: NextResponse };

export async function parseJsonBody(
  req: NextRequest,
  schema: z.ZodTypeAny,
): Promise<ParseBodyResult> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      res: NextResponse.json(
        { error: first?.message ?? "Datos inválidos." },
        { status: 422 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
