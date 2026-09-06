// Portada de agendapp: tests/unit/dgii-invoice-prepared-status-migration-v423.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
import { describe, it, expect } from "vitest";
import { leerSiExiste } from "./__port__/rutas";

import { INVOICE_STATUSES, TERMINAL_STATUSES } from "./submission-state-types";
import { ALLOWED_TRANSITIONS, evaluateTransition } from "./submission-state-machine";

/**
 * v423 — Migración PENDING que añade 'prepared' al CHECK de electronic_invoices.status.
 * La migración NO está aplicada (gate del dueño); estos tests son unit-level: verifican
 * la ESTRUCTURA del SQL forward-only + guardas + rollback, y la paridad con la máquina de
 * estados canónica. NO tocan la DB. Cubren los 16 puntos del mandato FASE 8.
 */

const MIGRATION_REL = "prisma/migrations/applied/20260724_dgii_invoice_prepared_status.sql";
const sql = leerSiExiste(MIGRATION_REL);

/** Líneas NO comentadas (SQL efectivo forward; el rollback está comentado con `--`). */
const forwardSql = sql
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

/** Valores del CHECK forward `status IN (...)` (el ADD no comentado). */
function forwardCheckValues(): string[] {
  const m = /status IN \(([\s\S]*?)\)/i.exec(forwardSql);
  if (!m) throw new Error("no se encontró el CHECK forward `status IN (...)`");
  return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
}

const EXPECTED_12 = [
  "draft", "generated", "validated", "signed", "prepared", "submitted",
  "in_process", "accepted", "accepted_conditional", "rejected", "cancelled", "error",
];

// ATENDIDO en la fase 2 (2026-09-06). Este fichero sigue en `skip` porque lee
// por ruta relativa la migración de agendapp
// (`prisma/migrations/applied/20260724_dgii_invoice_prepared_status.sql`,
// `MIGRATION_REL` arriba), que en este repositorio no existe: quitarle el
// `skip` sólo produciría un fallo por fichero ausente, no cobertura.
//
// Lo que sí existe es su equivalente contra la migración de DermaLand:
// `features/dgii/db/migracion-fase2.test.ts` → «el CHECK de `status` es
// exactamente INVOICE_STATUSES, sin que falte `prepared`», que compara el
// CHECK de `20260906090100_dgii_fase2_tablas.sql` contra `INVOICE_STATUSES`
// valor a valor y en orden. Ahí es donde las dos listas ya no se pueden
// separar sin que algo se ponga rojo.
describe.skip("v423 — migración prepared: estructura del CHECK", () => {
  it("#1 el CHECK acepta todos los estados previos (11)", () => {
    const values = forwardCheckValues();
    for (const s of EXPECTED_12.filter((v) => v !== "prepared")) expect(values).toContain(s);
  });
  it("#2 el CHECK acepta 'prepared'", () => {
    expect(forwardCheckValues()).toContain("prepared");
  });
  it("#3 el CHECK es una lista cerrada (exactamente 12 valores, sin desconocidos)", () => {
    const values = forwardCheckValues();
    expect(values).toEqual(EXPECTED_12);
    expect(new Set(values).size).toBe(12);
  });
  it("paridad TS↔migración: INVOICE_STATUSES == el nuevo CHECK (12)", () => {
    expect([...INVOICE_STATUSES]).toEqual(EXPECTED_12);
    expect(new Set(forwardCheckValues())).toEqual(new Set(INVOICE_STATUSES));
  });
});

describe.skip("v423 — migración prepared: máquina de estados canónica", () => {
  it("#4 signed → prepared es válida", () => {
    expect(ALLOWED_TRANSITIONS.signed).toContain("prepared");
    const r = evaluateTransition({
      currentStatus: "signed", targetStatus: "prepared", ambiente: "testecf",
      hasPreparedSubmission: false, realSendAllowed: false,
    });
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("prepared");
  });
  it("#5 prepared → submitted es válida (con submission preparada + envío permitido)", () => {
    expect(ALLOWED_TRANSITIONS.prepared).toContain("submitted");
    const r = evaluateTransition({
      currentStatus: "prepared", targetStatus: "submitted", ambiente: "testecf",
      hasPreparedSubmission: true, realSendAllowed: true,
    });
    expect(r.allowed).toBe(true);
  });
  it("#6 no permite transición desde un estado terminal (accepted → prepared bloqueado)", () => {
    for (const t of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[t]).toEqual([]);
      const r = evaluateTransition({
        currentStatus: t, targetStatus: "prepared", ambiente: "testecf",
        hasPreparedSubmission: false, realSendAllowed: false,
      });
      expect(r.allowed).toBe(false);
      expect(r.blockingReasons.join(" ")).toMatch(/terminal/i);
    }
  });
  it("#7 el flujo 'preparar envío futuro' (signed→prepared) queda cubierto por el CHECK (no 23514)", () => {
    // El único destino que hoy violaría el CHECK es 'prepared'; el nuevo CHECK lo incluye.
    expect(forwardCheckValues()).toContain("prepared");
    expect(ALLOWED_TRANSITIONS.signed).toContain("prepared");
  });
});

describe.skip("v423 — migración prepared: seguridad e invariantes (forward-only, no destructiva)", () => {
  it("#8 idempotente: no-op si el CHECK ya incluye prepared", () => {
    expect(forwardSql).toMatch(/position\('''prepared'''\s+IN\s+live_def\)\s*>\s*0/i);
    expect(forwardSql).toMatch(/RETURN;/);
  });
  it("guarda protectora: verifica el constraint esperado y aborta si no coincide", () => {
    expect(forwardSql).toMatch(/pg_get_constraintdef/);
    expect(forwardSql).toMatch(/live_def\s*<>\s*expected/);
    expect(forwardSql).toMatch(/RAISE EXCEPTION[\s\S]*no se sustituye un constraint desconocido/i);
  });
  it("#15 NO destructiva: sin DROP TABLE/COLUMN, TRUNCATE, DELETE, UPDATE de datos, NOT VALID, DISABLE RLS", () => {
    expect(forwardSql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(forwardSql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(forwardSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(forwardSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(forwardSql).not.toMatch(/\bUPDATE\s+\w/i);
    expect(forwardSql).not.toMatch(/NOT VALID/i);
    expect(forwardSql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    // Solo toca el constraint nombrado (DROP CONSTRAINT + ADD CONSTRAINT).
    expect(forwardSql).toMatch(/DROP CONSTRAINT electronic_invoices_status_check/);
    expect(forwardSql).toMatch(/ADD CONSTRAINT electronic_invoices_status_check/);
  });
  it("#9/#10/#11/#12/#13/#14 scope quirúrgico: no toca locks/audit/B2B/FE/Paso6/negocio duplicado ni datos", () => {
    // La migración es DDL sobre UN constraint; no referencia otros subsistemas.
    expect(forwardSql).not.toMatch(/audit_logs|received_ecf|received_commercial|dgii_certification|dgii_settings/i);
    expect(forwardSql).not.toMatch(/DGII_FE|real_send|dgii_enabled_real_send/i);
    expect(forwardSql).not.toMatch(/8c995bc8|business_id\s*=/i); // sin tocar negocio duplicado ni filtrar datos
    expect(forwardSql).not.toMatch(/ecf_sequences|track_id\s*=/i); // sin tocar secuencias/envíos
  });
});

describe.skip("v423 — migración prepared: rollback documentado (separado, no ejecutado)", () => {
  it("#16 el rollback ABORTA si existen filas prepared (no transforma filas)", () => {
    // El bloque rollback está COMENTADO (no se ejecuta al aplicar).
    const rollbackBlock = sql.slice(sql.indexOf("-- Rollback:"));
    expect(rollbackBlock).toMatch(/count\(\*\)[\s\S]*WHERE status = 'prepared'/);
    expect(rollbackBlock).toMatch(/n_prepared > 0[\s\S]*RAISE EXCEPTION[\s\S]*Requiere transición controlada/i);
    // El rollback restaura los 11 valores (sin prepared).
    expect(rollbackBlock).toMatch(/status IN \('draft'[\s\S]*'error'\)/);
    expect(rollbackBlock).not.toMatch(/status IN \([\s\S]*'prepared'[\s\S]*\)/); // el CHECK del rollback NO lleva prepared
  });
  it("el rollback está comentado (no se ejecuta en apply forward)", () => {
    // Todas las líneas SQL del rollback empiezan con `-- ` → no ejecutables.
    const rollbackBlock = sql.slice(sql.indexOf("-- ─", sql.indexOf("Rollback")));
    const sqlLines = rollbackBlock.split("\n").filter((l) => /ALTER TABLE|DO \$\$|RAISE|SELECT/.test(l));
    for (const l of sqlLines) expect(l.trimStart()).toMatch(/^--/);
  });
});
