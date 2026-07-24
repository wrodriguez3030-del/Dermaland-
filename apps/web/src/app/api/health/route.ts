import { NextResponse } from "next/server";

/**
 * Liveness público mínimo.
 *
 * DL-15: se retiran de la respuesta pública `NODE_ENV`, `APP_BUILD_SHA`,
 * `DATA_SOURCE` y el estado de integraciones — daban valor de reconocimiento
 * (p. ej. el build SHA para correlacionar CVEs) sin necesidad. El detalle de
 * configuración vive ahora solo en la página interna de Salud (autenticada).
 */
export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
