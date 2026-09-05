/**
 * Acceso a Supabase por PostgREST para los SCRIPTS (service_role).
 *
 * Vive aparte de `apps/web/src/server/repositories` a propósito: los scripts
 * corren con `tsx` fuera de Next y no pueden arrastrar `server-only` ni el
 * cliente de la app. Lo comparten `migrar-inventario-alegra.mts` y
 * `alegra-sync.mts` para que la escritura sea EXACTAMENTE la misma.
 *
 * `getAll` pagina de 1000 en 1000: sin `Range`, PostgREST corta en 1000 filas
 * EN SILENCIO (ver docs y la nota `dermaland-postgrest-1000-cap`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type Env = Record<string, string>;

/** Lee `apps/web/.env.local` (no lo imprime nunca) y lo mezcla con process.env. */
export function loadEnv(root: string): Env {
  let deArchivo: Env = {};
  try {
    deArchivo = Object.fromEntries(
      readFileSync(path.join(root, "apps/web/.env.local"), "utf8")
        .split("\n")
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    // En CI no hay .env.local: todo viene de process.env (secretos del workflow).
  }
  const deEntorno = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => typeof v === "string" && v !== ""),
  ) as Env;
  return { ...deArchivo, ...deEntorno };
}

export interface Rest {
  getAll<T>(pathQ: string): Promise<T[]>;
  insert<T>(table: string, row: Record<string, unknown>): Promise<T>;
  /** Inserta varias filas de una vez. Si una falla, falla el lote entero. */
  insertMany<T>(table: string, rows: Record<string, unknown>[]): Promise<T[]>;
  patch(table: string, filter: string, body: Record<string, unknown>): Promise<void>;
  /** Borra las filas que casen con `filter`. El filtro es OBLIGATORIO: sin él
   *  PostgREST se niega, que es justo lo que queremos (nada de borrar la tabla). */
  delete(table: string, filter: string): Promise<void>;
  /** Inserta o actualiza por `onConflict` (columnas separadas por coma). */
  upsert<T>(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<T[]>;
}

function restError(prefix: string, status: number, text: string): Error & { code?: string } {
  const err = new Error(`${prefix} → ${status} ${text}`) as Error & { code?: string };
  try {
    err.code = (JSON.parse(text) as { code?: string }).code;
  } catch {
    /* el cuerpo no era JSON */
  }
  return err;
}

export function makeRest(url: string, key: string): Rest {
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  const base = url.replace(/\/$/, "");
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  return {
    async getAll<T>(pathQ: string): Promise<T[]> {
      const out: T[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const r = await fetch(`${base}/rest/v1/${pathQ}`, {
          headers: { ...H, Range: `${from}-${from + page - 1}`, "Range-Unit": "items" },
        });
        if (!r.ok) throw restError(`GET ${pathQ}`, r.status, await r.text());
        const j = (await r.json()) as T[];
        out.push(...j);
        if (j.length < page) break;
      }
      return out;
    },

    async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
      const r = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      const text = await r.text();
      if (!r.ok) throw restError(`POST ${table}`, r.status, text);
      return (JSON.parse(text) as T[])[0]!;
    },

    async insertMany<T>(table: string, rows: Record<string, unknown>[]): Promise<T[]> {
      if (rows.length === 0) return [];
      const r = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify(rows),
      });
      const text = await r.text();
      if (!r.ok) throw restError(`POST ${table} (${rows.length} filas)`, r.status, text);
      return JSON.parse(text) as T[];
    },

    async patch(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
      const r = await fetch(`${base}/rest/v1/${table}?${filter}`, {
        method: "PATCH",
        headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw restError(`PATCH ${table}?${filter}`, r.status, await r.text());
    },

    async delete(table: string, filter: string): Promise<void> {
      if (!filter.trim()) throw new Error(`DELETE ${table} sin filtro: se niega por seguridad`);
      const r = await fetch(`${base}/rest/v1/${table}?${filter}`, {
        method: "DELETE",
        headers: { ...H, Prefer: "return=minimal" },
      });
      if (!r.ok) throw restError(`DELETE ${table}?${filter}`, r.status, await r.text());
    },

    async upsert<T>(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<T[]> {
      if (rows.length === 0) return [];
      const r = await fetch(`${base}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(rows),
      });
      const text = await r.text();
      if (!r.ok) throw restError(`UPSERT ${table}`, r.status, text);
      return JSON.parse(text) as T[];
    },
  };
}
