/**
 * Cliente de SOLO LECTURA para la API de Alegra (api.alegra.com/api/v1).
 *
 * Reglas (spec §3): Basic base64(email:token); páginas de máximo 30 con
 * `start`/`limit`; 150 peticiones por minuto — cuando `X-Rate-Limit-Remaining`
 * llega a 0 se espera `X-Rate-Limit-Reset` segundos; 429 espera y reintenta;
 * 5xx reintenta 3 veces (1 s, 2 s, 4 s); 401 aborta sin reintentar.
 *
 * `fetchImpl` y `sleep` se inyectan para que los tests no toquen red ni reloj.
 * A propósito NO existe ningún método que no sea GET: DermaLand nunca escribe
 * en Alegra (decisión 1 de la spec). No lleva `server-only` porque también lo
 * usan los scripts (tsx); las credenciales entran por el constructor, nunca
 * están en el módulo.
 */

export interface AlegraClientOptions {
  email: string;
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
}
export type AlegraQuery = Record<string, string | number | boolean | undefined>;
export type OnPage<T> = (rows: T[], start: number) => void | Promise<void>;

export class AlegraAuthError extends Error {
  constructor(message = "Alegra rechazó las credenciales (401). Revisa ALEGRA_EMAIL / ALEGRA_TOKEN.") {
    super(message);
    this.name = "AlegraAuthError";
  }
}
export class AlegraHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    path: string,
  ) {
    super(`Alegra ${status} en ${path}: ${body.slice(0, 200)}`);
    this.name = "AlegraHttpError";
  }
}

export const ALEGRA_PAGE_SIZE = 30;
const RETRY_WAITS_MS = [1000, 2000, 4000];
const DEFAULT_BASE_URL = "https://api.alegra.com/api/v1";

function resetMs(headers: Headers): number {
  const s = Number(headers.get("X-Rate-Limit-Reset") ?? "60");
  return Math.max(1, Number.isFinite(s) ? s : 60) * 1000;
}

export class AlegraClient {
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;
  private requestCount = 0;

  constructor(opts: AlegraClientOptions) {
    this.auth = `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString("base64")}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /** Peticiones HTTP hechas hasta ahora (incluye reintentos). */
  get requests(): number {
    return this.requestCount;
  }

  async get<T>(path: string, query?: AlegraQuery): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let retry = 0;
    for (;;) {
      this.requestCount++;
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: { Authorization: this.auth, Accept: "application/json" },
      });
      if (res.status === 401) throw new AlegraAuthError();
      if (res.status === 429) {
        await this.sleep(resetMs(res.headers));
        continue;
      }
      if (res.status >= 500 && retry < RETRY_WAITS_MS.length) {
        await this.sleep(RETRY_WAITS_MS[retry]!);
        retry++;
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new AlegraHttpError(res.status, text, path);
      const remaining = Number(res.headers.get("X-Rate-Limit-Remaining") ?? "1");
      if (Number.isFinite(remaining) && remaining <= 0) await this.sleep(resetMs(res.headers));
      return JSON.parse(text) as T;
    }
  }

  /**
   * Pagina de 30 en 30 hasta la primera página incompleta. Nunca usa
   * `metadata.total` (se queda en 10 000). `onPage` se espera antes de pedir
   * la página siguiente, así el llamador puede escribir por lotes.
   */
  async listAll<T>(path: string, query?: AlegraQuery, onPage?: OnPage<T>): Promise<T[]> {
    const all: T[] = [];
    for (let start = 0; ; start += ALEGRA_PAGE_SIZE) {
      const page = await this.get<T[]>(path, { ...query, start, limit: ALEGRA_PAGE_SIZE });
      if (onPage) await onPage(page, start);
      all.push(...page);
      if (page.length < ALEGRA_PAGE_SIZE) return all;
    }
  }
}
