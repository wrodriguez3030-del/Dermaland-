import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABLAS_LEGACY, nombreLegacy } from "./tablas";
import { TABLAS_NUEVAS } from "./tablas";

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");
const RETIRADA = "20260906090000_dgii_fase2_retirada_legacy.sql";

describe("fase 2 — migración de retirada", () => {
  const sql = leer(RETIRADA);
  const codigo = sql.replace(/--.*$/gm, "");

  it("renombra las 13 tablas viejas, exactamente las de TABLAS_LEGACY, ni una más ni una menos", () => {
    // El renombrado va en un bucle con `format()`, así que el nombre nuevo no
    // aparece literal en el fichero: lo que se comprueba es que sea exactamente
    // la lista TABLAS_LEGACY, con `format()` construyendo el sufijo con fecha.
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));

    // Extraer los nombres entrecomillados del arreglo `viejas text[]`
    const match = bloque.match(/array\[([\s\S]*?)\]/);
    expect(match, "no encontró array[ ]").toBeTruthy();
    const nombresEnSQL = (match![1]!)
      .split(",")
      .map(s => s.trim().replace(/^'|'$/g, ""))
      .filter(s => s.length > 0)
      .sort();

    // Comparar exactamente con TABLAS_LEGACY
    expect(nombresEnSQL).toEqual([...TABLAS_LEGACY].sort());

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

  it("suelta las dos claves foráneas de tablas VIVAS: si no se sueltan quedarían apuntando a la tabla retirada en vez de a la nueva", () => {
    expect(codigo).toMatch(/alter table public\.proformas\s+drop constraint if exists proformas_electronic_invoice_fk/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales\s+drop constraint if exists cash_closing_sales_electronic_invoice_fk/i);
  });

  it("no toca ninguna tabla intocable: las 13 del pliego no aparecen en el arreglo viejas", () => {
    // Las 13 tablas intocables del pliego de restricciones globales
    const intocables = [
      "invoice_numberings",
      "reserve_invoice_number",
      "proformas",
      "proforma_items",
      "proforma_payments",
      "cash_closings",
      "cash_closing_sales",
      "billing_settings",
      "proforma_counters",
      "next_proforma_number",
      "payment_methods",
      "cash_registers",
      "cash_register_sessions",
    ];

    // Extraer el arreglo `viejas text[]` del SQL
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));
    const match = bloque.match(/array\[([\s\S]*?)\]/);
    expect(match, "no encontró array[ ] en el bloque viejas").toBeTruthy();
    const nombresEnViejas = (match![1]!)
      .split(",")
      .map(s => s.trim().replace(/^'|'$/g, ""))
      .filter(s => s.length > 0);

    // Verificar que ninguna tabla intocable está en viejas
    for (const t of intocables) {
      expect(nombresEnViejas, `tabla intocable '${t}' aparece en viejas`).not.toContain(t);
    }
  });

  it("es idempotente: correrla dos veces no puede reventar", () => {
    // Cada renombrado va dentro de un `do $$ ... if exists ... end $$`.
    const renombrados = codigo.match(/rename to/gi) ?? [];
    const guardas = codigo.match(/to_regclass/gi) ?? [];
    expect(guardas.length, "cada renombrado necesita su guarda to_regclass").toBeGreaterThanOrEqual(renombrados.length);
  });
});

describe("fase 2 — migración de tablas", () => {
  const sql = leer("20260906090100_dgii_fase2_tablas.sql");
  const codigo = sql.replace(/--.*$/gm, "");

  it("crea las 17 tablas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `falta ${t}`).toMatch(
        new RegExp(`create table if not exists public\\.${t}\\s*\\(`, "i"),
      );
    }
  });

  it("TODAS llevan RLS: una tabla fiscal sin RLS es una fuga entre empresas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `${t} sin enable row level security`).toMatch(
        new RegExp(`alter table public\\.${t} enable row level security`, "i"),
      );
      expect(codigo, `${t} sin política`).toMatch(
        new RegExp(`create policy \\w+ on public\\.${t}`, "i"),
      );
    }
  });

  it("las políticas filtran por business_id con el ayudante de DermaLand", () => {
    const politicas = codigo.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(politicas.length).toBeGreaterThanOrEqual(TABLAS_NUEVAS.length);
    for (const p of politicas) {
      expect(p, `política sin business_id: ${p.slice(0, 70)}`).toMatch(/business_id\s*=\s*auth_business_id\(\)/i);
    }
    // agendapp usa otro ayudante; si se cuela, la política no filtra nada aquí.
    expect(codigo).not.toMatch(/current_user_business_id/i);
  });

  it("el e-NCF lleva su forma en la base, no solo en el código", () => {
    expect(codigo).toMatch(/e_ncf\s+varchar\(13\)\s+not null\s+check\s*\(e_ncf ~ '\^\[A-Z\]\[0-9\]\{12\}\$'\)/i);
    expect(codigo).toMatch(/constraint electronic_invoices_encf_uniq unique \(business_id, ambiente, e_ncf\)/i);
  });

  it("el ambiente entra en la llave única: probar un e-NCF no puede impedir emitirlo", () => {
    // Sin `ambiente` en el UNIQUE, emitir E320000000001 en testecf bloquearía
    // emitirlo de verdad en ecf. Es el error que agendapp documentó.
    const uniq = codigo.match(/unique \(business_id, ambiente, e_ncf\)/i);
    expect(uniq, "la llave única de e_ncf debe incluir el ambiente").not.toBeNull();
  });

  it("los 11 tipos de e-CF son los mismos que conoce el constructor portado", () => {
    expect(codigo).toMatch(/tipo_ecf in \('31','32','33','34','41','42','43','44','45','46','47'\)/i);
  });

  it("no crea nada con el nombre de una tabla intocable", () => {
    for (const t of ["invoice_numberings", "proformas", "cash_closing_sales"]) {
      expect(codigo).not.toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
    }
  });
});
