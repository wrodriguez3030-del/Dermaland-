import { NextResponse } from "next/server";
import { authorizeDgii } from "@/server/auth/require-role";
import { loadActiveCertificateAction } from "@/features/dgii/certificate-actions";

/**
 * GET /api/dgii/certificate/current
 *
 * Devuelve el certificado activo del business autenticado, sin
 * material sensible (sin blob, sin clave privada, sin contraseña).
 *
 * Si Fase F no está habilitada (DATA_SOURCE=mock o falta
 * DGII_CERT_ENCRYPTION_KEY) devuelve `{enabled:false, certificate:null}`.
 *
 * El wizard `/dgii/habilitacion` consume este endpoint en cliente para
 * sincronizar el `certificate-status-store` con la verdad del server.
 */
export async function GET() {
  // La RLS valida el `business_id`, no el rol (DL-01): sin esto,
  // cualquier usuario con sesión del negocio entraba aquí.
  const auth = await authorizeDgii("dgii.view");
  if (!auth.ok) return auth.res;

  try {
    const certificate = await loadActiveCertificateAction();
    return NextResponse.json({
      enabled: certificate !== null || true,
      certificate,
    });
  } catch (err) {
    return NextResponse.json(
      {
        enabled: false,
        certificate: null,
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
