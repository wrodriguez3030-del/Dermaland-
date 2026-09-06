/**
 * Resolución de endpoints DGII por ambiente (Fase G1). En G1 SOLO `testecf` puede
 * prepararse para envío; `certecf`/`ecf` quedan bloqueados.
 *
 * Las base URLs y paths provienen de `DGII_DEFAULT_BASE_URLS`/`DGII_PATHS`
 * (constantes de preview) y pueden override-arse por env. NO se llama red aquí.
 *
 * TODO(verificar): confirmar paths exactos (`autenticacion/api/semilla`,
 * `validacioncertificado`, `recepcion/api/ecf`, `consultaestado/api/Estado`) contra
 * la documentación oficial vigente de DGII antes del primer envío real (Fase G2).
 */
import { DgiiSendDisabledError, type DgiiAmbienteTarget } from "./killswitches";
import { DGII_DEFAULT_BASE_URLS } from "./dgii-client-types";

const ENV_BY_AMBIENTE: Record<DgiiAmbienteTarget, string> = {
  testecf: "DGII_TESTECF_BASE_URL",
  certecf: "DGII_CERTECF_BASE_URL",
  ecf: "DGII_ECF_BASE_URL",
};

/**
 * Valida una base URL: https, sin query string, sin userinfo (`@`), sin token/Bearer.
 * Rechaza intentos de meter credenciales/tokens en la config del endpoint.
 */
export function assertSafeBaseUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DgiiSendDisabledError("Base URL DGII inválida.");
  }
  if (u.protocol !== "https:") throw new DgiiSendDisabledError("La base URL DGII debe ser https.");
  if (u.search || u.username || u.password) throw new DgiiSendDisabledError("La base URL DGII no admite query ni credenciales.");
  if (/token|bearer/i.test(url)) throw new DgiiSendDisabledError("La base URL DGII no debe contener token.");
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** Base URL resuelta (env override o constante de preview), sin barra final, validada. */
export function resolveDgiiBaseUrl(ambiente: DgiiAmbienteTarget): string {
  const fromEnv = process.env[ENV_BY_AMBIENTE[ambiente]];
  const base = fromEnv && fromEnv.trim() ? fromEnv.trim() : DGII_DEFAULT_BASE_URLS[ambiente];
  return assertSafeBaseUrl(base);
}

/** En Fase G1 solo testecf está permitido. */
export function assertTestecfOnly(ambiente: DgiiAmbienteTarget): void {
  if (ambiente !== "testecf") {
    throw new DgiiSendDisabledError(`Ambiente '${ambiente}' bloqueado en esta fase (solo testecf).`);
  }
}

/** Timeout HTTP configurable (ms), default 15000. */
export function dgiiHttpTimeoutMs(): number {
  const n = Number.parseInt(process.env.DGII_HTTP_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 15_000;
}
