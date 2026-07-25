import "server-only";

/**
 * DL-17: rate limiter best-effort en memoria (ventana fija, por instancia).
 *
 * En serverless el estado de módulo persiste por instancia CALIENTE, así que
 * protege el patrón de abuso más común (un cliente martillando el mismo endpoint,
 * que suele caer en la misma instancia). Para límites estrictos ENTRE instancias,
 * cablear Upstash Redis (UPSTASH_REDIS_URL/TOKEN ya están en `.env`) detrás de esta
 * MISMA interfaz `rateLimit(...)` sin tocar los call sites.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Limpieza oportunista para acotar el tamaño del Map (barato, amortizado).
  if (store.size > 5000) {
    for (const [k, b] of store) if (now >= b.resetAt) store.delete(k);
  }

  const b = store.get(key);
  if (!b || now >= b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return { ok: true, retryAfterSec: 0, remaining: limit - b.count };
}

/** Respuesta 429 estándar con `Retry-After`. */
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

/** Solo para tests: limpia el estado en memoria. */
export function _resetRateLimitStore(): void {
  store.clear();
}
