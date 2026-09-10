import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MERGE_IMPACT_TABLES } from "./merge-clients";

/**
 * `merge_clients` no se puede aplicar desde aquí —la aplica el dueño o se
 * aplica vía MCP, nunca en un test— así que se prueba como se prueban las
 * migraciones en esta casa (`migracion-desglose.test.ts`): leyendo el SQL y
 * atándolo a `MERGE_IMPACT_TABLES`, la MISMA lista que usa el dry-run
 * (Task 3). Si alguien agrega una tabla a la lista TypeScript y olvida
 * tocar el SQL —o viceversa— esta prueba lo dice; un grep manual no lo
 * habría notado.
 */
const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const SQL = readFileSync(resolve(MIGRACIONES, "20260909170000_merge_clients.sql"), "utf8");

const sinComentarios = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const unaLinea = (sql: string) => sinComentarios(sql).replace(/\s+/g, " ");

describe("merge_clients — el SQL cubre EXACTAMENTE las 7 tablas de MERGE_IMPACT_TABLES", () => {
  const contenido = unaLinea(SQL);

  it("define la función con el nombre y la firma esperados", () => {
    expect(contenido).toContain(
      "create or replace function public.merge_clients( p_primary_id uuid, p_duplicate_id uuid ) returns jsonb",
    );
  });

  it.each(MERGE_IMPACT_TABLES)(
    "reasigna $table.$column de duplicado a primario, filtrado por negocio",
    ({ table, column }) => {
      expect(contenido).toContain(
        `update public.${table} set ${column} = p_primary_id where ${column} = p_duplicate_id and business_id = v_biz;`,
      );
    },
  );

  it("no reasigna ninguna tabla que no esté en MERGE_IMPACT_TABLES", () => {
    const asignaciones = [...contenido.matchAll(/update public\.(\w+) set \w+ = p_primary_id/g)].map(
      (m) => m[1],
    );
    expect(new Set(asignaciones)).toEqual(new Set(MERGE_IMPACT_TABLES.map((t) => t.table)));
  });

  it("es SECURITY INVOKER (no declara `security definer`) y fija search_path", () => {
    expect(contenido).not.toContain("security definer");
    expect(contenido).toContain("set search_path = public");
  });

  it("deja el duplicado con soft-delete, no borrado físico", () => {
    expect(contenido).toContain(
      "update public.clients set deleted_at = now(), updated_at = now() where id = p_duplicate_id and business_id = v_biz;",
    );
    expect(contenido).not.toMatch(/delete from public\.clients/);
  });

  it("rellena teléfono/whatsapp/email/fecha de nacimiento/dirección/documento con coalesce", () => {
    for (const campo of ["phone", "whatsapp", "email", "birth_date", "address", "document_number"]) {
      expect(contenido).toContain(`${campo} = coalesce(v_primary.${campo}, v_duplicate.${campo})`);
    }
  });
});
