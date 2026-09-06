import "server-only";

/**
 * Vigencia de un certificado fiscal, por fecha.
 *
 * Menor (segunda tanda, revisión externa): antes había DOS reglas de
 * vigencia escritas por separado, con el mismo propósito pero distinto
 * alcance. `certificates.ts` (`obtenerCertificadoActivo`) comprobaba las
 * DOS fechas —`valid_to` (vencido) y `valid_from` (aún no vigente)— antes
 * de descifrar el `.p12`. `enablement.ts` (el gate que decide "se puede
 * emitir") solo miraba `valid_to`, mismo criterio que `s3` en agendapp.
 *
 * La consecuencia real: un certificado subido con antelación (`valid_from`
 * en el futuro, por ejemplo uno que entra en vigor la semana próxima)
 * pasaba el gate de habilitación como "activo" sin ningún bloqueo — el
 * hueco solo se descubría al intentar firmar de verdad, con
 * `obtenerCertificadoActivo` lanzando `ErrorCertificado`. La pantalla de
 * habilitación habría dicho "todo listo" mientras la primera venta real
 * fallaba.
 *
 * Ahora los dos módulos llaman a esta única función: una sola regla, un
 * solo lugar donde corregirla si algún día cambia.
 *
 * `null` en cualquiera de las dos fechas no bloquea esa mitad de la regla
 * — no hay con qué comparar (mismo criterio que ya tenía cada mitad por
 * separado antes de unificarse aquí).
 */
export function certificadoVigente(
  fechas: { valid_from: string | null; valid_to: string | null },
  ahora: Date = new Date(),
): boolean {
  if (fechas.valid_to && new Date(fechas.valid_to) < ahora) return false;
  if (fechas.valid_from && new Date(fechas.valid_from) > ahora) return false;
  return true;
}
