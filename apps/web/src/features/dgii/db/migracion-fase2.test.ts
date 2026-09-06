import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABLAS_LEGACY, nombreLegacy } from "./tablas";

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");
const RETIRADA = "20260906090000_dgii_fase2_retirada_legacy.sql";

describe("fase 2 — migración de retirada", () => {
  const sql = leer(RETIRADA);
  const codigo = sql.replace(/--.*$/gm, "");

  it("renombra las 13 tablas viejas, ni una menos", () => {
    // El renombrado va en un bucle con `format()`, así que el nombre nuevo no
    // aparece literal en el fichero: lo que se comprueba es que las 13 estén en
    // la lista y que el `format` construya el sufijo con fecha.
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));
    for (const t of TABLAS_LEGACY) {
      expect(bloque, `no renombra ${t}`).toMatch(new RegExp(`'${t}'`));
    }
    expect(bloque).toMatch(/format\('alter table public\.%I rename to %I'/);
    expect(bloque).toMatch(/'_legacy_20260906'/);
    expect(nombreLegacy("dgii_logs")).toBe("dgii_logs_legacy_20260906");
  });

  it("NO borra nada: un módulo que nunca emitió puede hacer falta para explicar el pasado", () => {
    expect(codigo).not.toMatch(/drop\s+table/i);
    expect(codigo).not.toMatch(/truncate/i);
    expect(codigo).not.toMatch(/drop\s+column/i);
    expect(codigo).not.toMatch(/delete\s+from/i);
  });

  it("suelta las dos claves foráneas de tablas VIVAS, que si no bloquean el renombrado", () => {
    expect(codigo).toMatch(/alter table public\.proformas\s+drop constraint if exists proformas_electronic_invoice_fk/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales\s+drop constraint if exists cash_closing_sales_electronic_invoice_fk/i);
  });

  it("no toca ninguna tabla intocable", () => {
    for (const t of ["invoice_numberings", "proforma_items", "proforma_payments", "cash_registers"]) {
      expect(codigo, `toca ${t}`).not.toMatch(new RegExp(`alter table[^;]*\\b${t}\\b`, "i"));
    }
  });

  it("es idempotente: correrla dos veces no puede reventar", () => {
    // Cada renombrado va dentro de un `do $$ ... if exists ... end $$`.
    const renombrados = codigo.match(/rename to/gi) ?? [];
    const guardas = codigo.match(/to_regclass/gi) ?? [];
    expect(guardas.length, "cada renombrado necesita su guarda to_regclass").toBeGreaterThanOrEqual(renombrados.length);
  });
});
