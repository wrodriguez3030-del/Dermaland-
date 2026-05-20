import { NextResponse } from "next/server";
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
