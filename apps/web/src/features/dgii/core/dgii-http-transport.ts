import "server-only";

/**
 * Transporte HTTP REAL para DGII (Fase G1). Único punto del módulo que invoca `fetch`.
 * NO se instancia en la suite normal de tests (se inyecta un mock). Solo se usa en
 * modo live, detrás de los gates de executeDgiiSubmission. Aplica timeout obligatorio,
 * redacta headers sensibles y trunca el body. No hace retry (lo decide la capa superior).
 */
import {
  DGII_MAX_RESPONSE_BYTES,
  DgiiHttpError,
  type DgiiHttpRequest,
  type DgiiHttpResponse,
  type DgiiHttpTransport,
} from "./dgii-http-transport-types";

const SENSITIVE_HEADER = /^(authorization|set-cookie|cookie|x-token|token)$/i;

function redactResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADER.test(key) ? "<redacted>" : value;
  });
  return out;
}

/** Crea el transporte real basado en fetch. NO ejecuta nada hasta request(). */
export function createFetchTransport(): DgiiHttpTransport {
  return {
    async request(input: DgiiHttpRequest): Promise<DgiiHttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs);
      const start = Date.now();
      try {
        const res = await fetch(input.url, {
          method: input.method,
          headers: input.headers,
          body: input.body as BodyInit | undefined,
          signal: controller.signal,
        });
        const raw = await res.text();
        const bodyText = raw.length > DGII_MAX_RESPONSE_BYTES ? `${raw.slice(0, DGII_MAX_RESPONSE_BYTES)}…[truncated]` : raw;
        return { status: res.status, headersRedacted: redactResponseHeaders(res.headers), bodyText, elapsedMs: Date.now() - start };
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") throw new DgiiHttpError(`Timeout tras ${input.timeoutMs}ms`, "timeout");
        throw new DgiiHttpError("Error de red en transporte DGII.", "network");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Transporte deshabilitado: lanza siempre. Default seguro fuera de modo live. */
export function createDisabledTransport(): DgiiHttpTransport {
  return {
    async request(): Promise<DgiiHttpResponse> {
      throw new DgiiHttpError("Transporte DGII deshabilitado.", "transport_disabled");
    },
  };
}
