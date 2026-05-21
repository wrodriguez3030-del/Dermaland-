import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/context";
import {
  runTestecfPreflight,
  PreflightError,
  type SupportedTipoEcfPreflight,
  type TestecfPreflightResult,
} from "@/server/services/dgii/testecf-preflight";

/**
 * POST /api/dgii/invoices/testecf-send
 *
 * **Dry-run de Fase G.** Construye el payload exacto que se enviaría a
 * DGII testecf (XML + firma + URLs) y devuelve evidencia sin secretos.
 * **NO hace fetch a DGII.** El cliente `executeTestecfSubmission` está
 * separado en `testecf-client.ts` y tira `TestecfSendDisabled` siempre
 * que se invoque hoy (Fase G real no autorizada).
 *
 * Body:
 *   { tipoEcf: "31" | "32" | "33" | "34" }
 *
 * Si en el futuro se quiere intentar envío real, agregar:
 *   { live: true, postulacionApproved: true, rangoAuthorized: true,
 *     userConfirmedAt: ISO-string }
 * Y aún así requiere `DGII_TESTECF_SEND_ENABLED=true` en env. Por ahora
 * el endpoint ignora `live` para ser inmune a accidentes.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  const tipoEcf = (body as { tipoEcf?: unknown }).tipoEcf;
  if (
    tipoEcf !== "31" &&
    tipoEcf !== "32" &&
    tipoEcf !== "33" &&
    tipoEcf !== "34"
  ) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_tipo_ecf",
        message:
          "tipoEcf debe ser '31', '32', '33' o '34' (este endpoint dry-run solo soporta esos cuatro).",
      },
      { status: 400 },
    );
  }

  let result: TestecfPreflightResult;
  try {
    result = await runTestecfPreflight({
      businessId: session.businessId,
      branchId: session.branchId,
      userId: session.user.id,
      tipoEcf: tipoEcf as SupportedTipoEcfPreflight,
    });
  } catch (err) {
    if (err instanceof PreflightError) {
      const status =
        err.code === "FEATURE_DISABLED" ? 503
        : err.code === "NO_ACTIVE_CERTIFICATE" ? 412
        : err.code === "SETTINGS_MISSING" ? 412
        : err.code === "XSD_NOT_FOUND" ? 500
        : 422;
      return NextResponse.json(
        {
          ok: false,
          reason: "preflight_failed",
          code: err.code,
          message: err.message,
        },
        { status },
      );
    }
    // No leakeamos detalle interno.
    return NextResponse.json(
      { ok: false, reason: "unknown_error" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    preflight: result,
  });
}
