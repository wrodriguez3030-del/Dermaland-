/**
 * Cliente de SOLO LECTURA para la API de Alegra (api.alegra.com/api/v1).
 *
 * Reglas (spec §3, corregidas contra la API real el 2026-09-05): Basic
 * base64(email:token); páginas de máximo 30 con `start`/`limit`.
 *
 * LÍMITE DE PETICIONES — la documentación dice 150/min y HTTP 429; la API de
 * esta cuenta dice `x-rate-limit-limit: 100` y, al pasarse, responde
 * **HTTP 400** con `{"code":429,"message":"Too many requests"}` en el CUERPO.
 * Por eso aquí: (1) se espacian las peticiones a 60000/límite ms en cuanto se
 * conoce el límite, para no disparar el corte por ráfaga; (2) se trata como
 * límite tanto el 429 como el 400 con ese cuerpo; (3) se espera lo que diga
 * `x-rate-limit-reset` (cabecera o cuerpo).
 *
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
/** Tope de esperas por límite en UNA petición, para no quedarse colgado. */
const MAX_RATE_LIMIT_WAITS = 10;

function parseBody(text: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(text) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `true` si la respuesta es un corte por límite, venga como 429 o como 400. */
export function isRateLimited(status: number, text: string): boolean {
  if (status === 429) return true;
  if (status !== 400) return false;
  const body = parseBody(text);
  if (!body) return false;
  return Number(body.code) === 429 || /too many request/i.test(String(body.message ?? ""));
}

function resetMs(headers: Headers, text = ""): number {
  const deCabecera = headers.get("x-rate-limit-reset");
  const body = parseBody(text);
  const deCuerpo = (body?.headers as Record<string, unknown> | undefined)?.["x-rate-limit-reset"];
  const s = Number(deCabecera ?? deCuerpo ?? 60);
  return Math.max(1, Number.isFinite(s) && s > 0 ? s : 60) * 1000;
}

export class AlegraClient {
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;
  private requestCount = 0;
  /** Espaciado mínimo entre peticiones; 0 hasta conocer el límite de la cuenta. */
  private minIntervalMs = 0;
  private lastRequestAt = 0;

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
    let esperasPorLimite = 0;
    for (;;) {
      if (this.minIntervalMs > 0) {
        const falta = this.minIntervalMs - (Date.now() - this.lastRequestAt);
        if (falta > 0) await this.sleep(falta);
      }
      this.lastRequestAt = Date.now();
      this.requestCount++;
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: { Authorization: this.auth, Accept: "application/json" },
      });
      if (res.status === 401) throw new AlegraAuthError();
      if (res.status >= 500 && retry < RETRY_WAITS_MS.length) {
        await this.sleep(RETRY_WAITS_MS[retry]!);
        retry++;
        continue;
      }
      const text = await res.text();

      // El límite de la cuenta lo dice la propia API; a partir de ahí se
      // espacian las peticiones para no volver a chocar.
      const limite = Number(res.headers.get("x-rate-limit-limit") ?? "0");
      if (Number.isFinite(limite) && limite > 0) this.minIntervalMs = Math.ceil(60000 / limite);

      if (isRateLimited(res.status, text)) {
        if (++esperasPorLimite > MAX_RATE_LIMIT_WAITS) {
          throw new AlegraHttpError(res.status, text, path);
        }
        await this.sleep(resetMs(res.headers, text));
        continue;
      }
      if (!res.ok) throw new AlegraHttpError(res.status, text, path);
      const remaining = Number(res.headers.get("x-rate-limit-remaining") ?? "1");
      if (Number.isFinite(remaining) && remaining <= 0) await this.sleep(resetMs(res.headers, text));
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
