/**
 * Dispara el workflow diario de sincronización desde la app.
 *
 * La app NO sincroniza: solo le pide a GitHub Actions que corra el trabajo que
 * ya existe. Así el token de Alegra vive únicamente en los secretos del
 * workflow y nunca en el servidor web, y una corrida a mano es idéntica a la
 * automática (mismos pasos, mismo registro).
 */
import "server-only";
import { env } from "@/lib/env";

export type DispatchResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string };

export interface DispatchOptions {
  modo?: "incremental" | "full";
  entidades?: string;
  simulacion?: boolean;
  fetchImpl?: typeof fetch;
}

const ENTIDADES_VALIDAS = new Set(["contacts", "items", "stock", "invoices"]);

/** `true` si las entidades son una lista separada por comas de las conocidas. */
export function entidadesValidas(valor: string): boolean {
  const partes = valor.split(",").map((p) => p.trim());
  return partes.length > 0 && partes.every((p) => ENTIDADES_VALIDAS.has(p));
}

export async function dispararSincronizacion(opts: DispatchOptions = {}): Promise<DispatchResult> {
  const token = env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 409,
      message:
        "Falta el token de GitHub Actions (GITHUB_ACTIONS_TOKEN). Sin él, la sincronización solo corre sola a las 6:00 a. m. o a mano desde GitHub.",
    };
  }
  const entidades = opts.entidades ?? "contacts,items,stock,invoices";
  if (!entidadesValidas(entidades)) {
    return { ok: false, status: 400, message: `Entidades no válidas: ${entidades}` };
  }
  const modo = opts.modo === "full" ? "full" : "incremental";
  const repo = env.GITHUB_REPOSITORY;
  const workflow = env.ALEGRA_SYNC_WORKFLOW;
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          modo,
          entidades,
          simulacion: opts.simulacion === true,
        },
      }),
    },
  );

  if (res.status === 204) {
    return { ok: true, url: `https://github.com/${repo}/actions/workflows/${workflow}` };
  }
  const texto = await res.text();
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: 502,
      message:
        "GitHub rechazó el token. Necesita permiso `actions: write` sobre este repositorio y no puede estar vencido.",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      status: 502,
      message: `GitHub no encuentra el workflow «${workflow}» en ${repo}. Revisa que esté en la rama main.`,
    };
  }
  return { ok: false, status: 502, message: `GitHub respondió ${res.status}: ${texto.slice(0, 200)}` };
}
