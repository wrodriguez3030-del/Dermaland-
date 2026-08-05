import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDermaLandFootprint } from "../../../../scripts/backup/lib/dermaland-footprint.mjs";

describe("buildDermaLandFootprint — hermético (fixture temporal)", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("extrae solo nombres de tabla (`create table`), ignorando columnas/funciones/índices", () => {
    dir = mkdtempSync(path.join(tmpdir(), "dermaland-footprint-"));
    writeFileSync(
      path.join(dir, "0001_fixture.sql"),
      `
        create table if not exists public.products (id uuid primary key);
        alter table public.products add column if not exists barcode text;
        create or replace function public.emit_sale_atomic() returns void as $$ begin end; $$ language plpgsql;
        create unique index idx_products_barcode on public.products (barcode);
        create table clients (id uuid primary key);
      `,
    );
    const huella = buildDermaLandFootprint({ migrationsDir: dir });
    expect(huella).toBeInstanceOf(Set);
    expect([...huella].sort()).toEqual(["clients", "products"]);
  });

  it("acumula tablas de varios archivos .sql y descarta duplicados", () => {
    dir = mkdtempSync(path.join(tmpdir(), "dermaland-footprint-"));
    writeFileSync(path.join(dir, "0001_a.sql"), "create table businesses (id uuid primary key);");
    writeFileSync(
      path.join(dir, "0002_b.sql"),
      "create table if not exists businesses (id uuid primary key); create table proformas (id uuid primary key);",
    );
    const huella = buildDermaLandFootprint({ migrationsDir: dir });
    expect([...huella].sort()).toEqual(["businesses", "proformas"]);
  });

  it("ignora archivos que no son .sql", () => {
    dir = mkdtempSync(path.join(tmpdir(), "dermaland-footprint-"));
    writeFileSync(path.join(dir, "README.md"), "create table fantasma (id uuid);");
    writeFileSync(path.join(dir, "0001_real.sql"), "create table real_table (id uuid);");
    const huella = buildDermaLandFootprint({ migrationsDir: dir });
    expect([...huella]).toEqual(["real_table"]);
  });
});

describe("buildDermaLandFootprint — contra el repo real (supabase/migrations)", () => {
  // Ronda de correccion 1 (2026-08-05): la huella hardcodeada anterior tenía
  // 16 de 83 tablas reales, y 4 de esos 16 nombres NO EXISTEN en producción.
  // Verificado por separado con information_schema.tables contra
  // sntcvyozbhrgicwmtcoh: la huella derivada de supabase/migrations/*.sql
  // coincide 1 a 1 con las 83 tablas base reales (0 de más, 0 de menos).
  // Esta prueba fija esa garantía sin repetir la lista completa: confirma
  // presencia de nombres reales y AUSENCIA de los nombres inventados que
  // motivaron esta correccion.

  it("incluye nombres reales de tablas que la huella anterior tenía mal o no cubría", () => {
    const huella = buildDermaLandFootprint();
    for (const tabla of [
      "businesses",
      "proformas",
      "proforma_items", // antes mal escrito como "sale_items"
      "product_categories", // antes mal escrito como "categories"
      "cash_register_sessions", // antes mal escrito como "cash_sessions"
      "cash_registers",
    ]) {
      expect(huella.has(tabla), `falta "${tabla}" en la huella derivada`).toBe(true);
    }
  });

  it("NO incluye los nombres inventados que la huella anterior tenía (no existen en producción)", () => {
    const huella = buildDermaLandFootprint();
    for (const tabla of ["sales", "sale_items", "categories", "cash_sessions"]) {
      expect(huella.has(tabla), `"${tabla}" no debería estar: no existe en producción`).toBe(false);
    }
  });

  it("deriva un número de tablas consistente con el tamaño real del esquema (>= 80)", () => {
    // No se fija el número exacto (83 al momento de esta corrección) para no
    // volver la prueba frágil ante migraciones futuras — pero una caída muy
    // por debajo indicaría que el extractor dejó de leer migraciones reales.
    const huella = buildDermaLandFootprint();
    expect(huella.size).toBeGreaterThanOrEqual(80);
  });
});
