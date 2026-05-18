import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DGII_RBAC_PENDING_KEYS,
  roleDefinitions,
  roleHasPermission,
} from "./users";

/**
 * Test de sincronía entre `roleDefinitions` (TS) y
 * `supabase/migrations/0005_dgii_role_permissions_seed.sql`.
 *
 * Si cambias asignaciones de permisos en TS y olvidas actualizar el SQL,
 * este test falla con un diff explícito de qué pares (role, permission)
 * están en uno pero no en el otro.
 *
 * El parser de SQL es deliberadamente simple — solo busca tuplas
 * `('role_code', 'permission_code')` en líneas dentro de bloques
 * `INSERT INTO role_permissions ... VALUES`. Acepta espacios y comentarios.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  "../..",
  "supabase",
  "migrations",
  "0005_dgii_role_permissions_seed.sql",
);

interface SqlPair {
  role: string;
  permission: string;
}

/** Extrae todos los pares (role_code, permission_code) del SQL. */
function parseSqlPairs(sql: string): SqlPair[] {
  // Sólo nos interesan las líneas dentro de bloques `INSERT INTO
  // role_permissions ... VALUES` — no `INSERT INTO roles`.
  const pairs: SqlPair[] = [];
  // Match `('role', 'permission')` strings; ambas comillas simples; permite
  // espacios y newlines. Restringimos a tuplas con DOS strings entre comillas.
  const tupleRegex = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
  // Pero `INSERT INTO roles` también tiene tuplas de 3 valores. Para
  // distinguir, buscamos los bloques `INSERT INTO role_permissions`.
  const blockRegex =
    /INSERT INTO role_permissions[\s\S]*?ON CONFLICT[^;]*;/g;
  const blocks = sql.match(blockRegex) ?? [];
  for (const block of blocks) {
    let m: RegExpExecArray | null;
    const re = new RegExp(tupleRegex.source, "g");
    while ((m = re.exec(block)) !== null) {
      pairs.push({ role: m[1]!, permission: m[2]! });
    }
  }
  return pairs;
}

function expectedPairsFromTs(): SqlPair[] {
  const pairs: SqlPair[] = [];
  for (const role of roleDefinitions) {
    for (const key of DGII_RBAC_PENDING_KEYS) {
      if (roleHasPermission(role, key)) {
        pairs.push({ role: role.key, permission: key });
      }
    }
  }
  return pairs;
}

function pairKey(p: SqlPair): string {
  return `${p.role}::${p.permission}`;
}

// Lectura en module-load: parseo determinístico y compartido por todos los its.
const sqlContent = readFileSync(MIGRATION_PATH, "utf8");
const sqlPairs = parseSqlPairs(sqlContent);
const tsPairs = expectedPairsFromTs();

describe("0005_dgii_role_permissions_seed.sql ↔ roleDefinitions sync", () => {
  it("el archivo SQL existe y se puede leer", () => {
    expect(sqlContent.length).toBeGreaterThan(1000);
    expect(sqlContent).toContain(
      "INSERT INTO role_permissions (role_code, permission_code)",
    );
  });

  it("declara CREATE TABLE IF NOT EXISTS para roles y role_permissions", () => {
    expect(sqlContent).toContain("CREATE TABLE IF NOT EXISTS roles");
    expect(sqlContent).toContain(
      "CREATE TABLE IF NOT EXISTS role_permissions",
    );
  });

  it("declara los 7 roles esperados", () => {
    for (const role of [
      "super_admin",
      "admin",
      "manager",
      "cashier",
      "inventory",
      "supervisor",
      "auditor",
    ]) {
      expect(sqlContent).toContain(`('${role}',`);
    }
  });

  it("usa INSERT ... ON CONFLICT DO NOTHING (idempotente)", () => {
    // Cada bloque INSERT INTO role_permissions debe terminar con ON CONFLICT.
    const blocks =
      sqlContent.match(
        /INSERT INTO role_permissions[\s\S]*?ON CONFLICT[^;]*;/g,
      ) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toContain("ON CONFLICT");
      expect(block).toMatch(/DO NOTHING/i);
    }
  });

  it("NO contiene operaciones destructivas", () => {
    const lc = sqlContent.toLowerCase();
    // permitir comentarios con "drop table" o "delete from" en sección de
    // rollback. Verificamos que NO haya statements activos.
    const activeLines = sqlContent
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"));
    const activeSql = activeLines.join("\n").toLowerCase();
    expect(activeSql).not.toMatch(/\bdrop\s+table\b/);
    expect(activeSql).not.toMatch(/\btruncate\b/);
    expect(activeSql).not.toMatch(/\bdelete\s+from\b/);
    expect(lc).toContain("idempotente"); // doc del propio archivo
  });

  it("número de pares coincide con TS: 59 esperados", () => {
    expect(tsPairs.length).toBe(59);
    expect(sqlPairs.length).toBe(59);
  });

  it("conteo por rol coincide con el esperado", () => {
    const expected: Record<string, number> = {
      super_admin: 18,
      admin: 18,
      manager: 12,
      cashier: 4,
      inventory: 0,
      supervisor: 3,
      auditor: 4,
    };
    const countBy = (pairs: SqlPair[]) =>
      pairs.reduce<Record<string, number>>((acc, p) => {
        acc[p.role] = (acc[p.role] ?? 0) + 1;
        return acc;
      }, {});
    const sqlCount = countBy(sqlPairs);
    const tsCount = countBy(tsPairs);
    for (const [role, n] of Object.entries(expected)) {
      expect(sqlCount[role] ?? 0, `SQL ${role}`).toBe(n);
      expect(tsCount[role] ?? 0, `TS ${role}`).toBe(n);
    }
  });

  it("cada par del TS existe en el SQL (sin faltantes)", () => {
    const sqlSet = new Set(sqlPairs.map(pairKey));
    const missing = tsPairs.filter((p) => !sqlSet.has(pairKey(p)));
    expect(missing, `Faltan en SQL: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("cada par del SQL existe en el TS (sin extras)", () => {
    const tsSet = new Set(tsPairs.map(pairKey));
    const extras = sqlPairs.filter((p) => !tsSet.has(pairKey(p)));
    expect(extras, `Extras en SQL: ${JSON.stringify(extras)}`).toEqual([]);
  });

  it("inventory no tiene permisos DGII/cash en el SQL", () => {
    const invPairs = sqlPairs.filter((p) => p.role === "inventory");
    expect(invPairs).toEqual([]);
  });
});
