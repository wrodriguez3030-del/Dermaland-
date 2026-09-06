/**
 * Transporte HTTP inyectable para DGII (Fase G1). La implementación real vive en
 * dgii-http-transport.ts; los tests inyectan un mock. NUNCA se ejecuta red en la
 * suite normal. Redacta Authorization/token y trunca el body en logs/respuestas.
 */

export type DgiiHttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  /** string XML, bytes o FormData (multipart). Nunca se loguea completo. */
  body?: string | Uint8Array | FormData;
  /** Timeout obligatorio (ms). */
  timeoutMs: number;
  /** Etiqueta para logs (no incluye contenido sensible). */
  redactionLabel?: string;
};

export type DgiiHttpResponse = {
  status: number;
  /** Headers con valores sensibles redactados (Authorization/Set-Cookie/token). */
  headersRedacted: Record<string, string>;
  /** Body como texto, truncado a DGII_MAX_RESPONSE_BYTES. */
  bodyText: string;
  elapsedMs: number;
};

export interface DgiiHttpTransport {
  request(input: DgiiHttpRequest): Promise<DgiiHttpResponse>;
}

/** Límite defensivo del body de respuesta que se retiene en memoria/logs. */
export const DGII_MAX_RESPONSE_BYTES = 256 * 1024;

export class DgiiHttpError extends Error {
  constructor(
    message: string,
    public code: "timeout" | "network" | "transport_disabled" | "bad_status" = "network",
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "DgiiHttpError";
  }
}
