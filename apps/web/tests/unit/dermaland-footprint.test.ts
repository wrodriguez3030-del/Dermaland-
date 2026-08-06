import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDermaLandFootprint,
  CLASES_DE_RELACION,
  KINDS_DE_LA_HUELLA,
  RELKINDS_DEL_DESTINO,
  sqlRelacionesDelDestino,
} from "../../../../scripts/backup/lib/dermaland-footprint.mjs";
import { assertSafeTarget } from "../../../../scripts/backup/lib/assert-safe-target.mjs";
import { listTargetTables } from "../../../../scripts/backup/lib/list-target-tables.mjs";

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

  it("incluye las VISTAS declaradas, no solo las tablas", () => {
    // Ronda de corrección 2: la huella solo miraba `create table`, así que la
    // única vista del repo quedaba fuera y la guarda la trataba como una tabla
    // AJENA. Ver el bloque de regresión al final de este archivo.
    dir = mkdtempSync(path.join(tmpdir(), "dermaland-footprint-"));
    writeFileSync(
      path.join(dir, "0001_fixture.sql"),
      `
        create table product_lots (id uuid primary key);
        create or replace view inventory_stock_by_lot as select id from product_lots;
        create materialized view resumen_ventas as select 1 as n;
      `,
    );
    const huella = buildDermaLandFootprint({ migrationsDir: dir });
    expect([...huella].sort()).toEqual(["inventory_stock_by_lot", "product_lots", "resumen_ventas"]);
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

  it("conoce `inventory_stock_by_lot`, la vista que hacía abortar toda restauración", () => {
    expect(buildDermaLandFootprint().has("inventory_stock_by_lot")).toBe(true);
  });

  it("deriva un número de tablas consistente con el tamaño real del esquema (>= 80)", () => {
    // No se fija el número exacto (83 al momento de esta corrección) para no
    // volver la prueba frágil ante migraciones futuras — pero una caída muy
    // por debajo indicaría que el extractor dejó de leer migraciones reales.
    const huella = buildDermaLandFootprint();
    expect(huella.size).toBeGreaterThanOrEqual(80);
  });
});

describe("un solo criterio de «relación del destino» para los DOS llamadores", () => {
  // Ronda de corrección 2 (2026-08-06). La guarda `assertSafeTarget` tiene dos
  // llamadores reales y cada uno listaba el destino a su manera:
  //   - dr-drill.mjs        → `pg_tables`, que NO devuelve vistas.
  //   - restore-from-json   → PostgREST (`listTargetTables`), que SÍ las expone.
  // Por eso ninguna revisión por tarea vio el fallo: el simulacro pasaba y la
  // restauración documentada abortaba SIEMPRE, con un mensaje que acusa al
  // destino de estar contaminado cuando está perfecto.
  //
  // Estas pruebas fijan las dos mitades: que el criterio se declara una sola
  // vez, y que los dos llamadores siguen usándolo.

  const leer = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("el SQL del destino deriva sus relkinds de CLASES_DE_RELACION, no de una lista aparte", () => {
    const sql = sqlRelacionesDelDestino();
    for (const relkind of RELKINDS_DEL_DESTINO) {
      expect(sql, `el SQL no cubre relkind '${relkind}'`).toContain(`'${relkind}'`);
    }
    // Y nada más: los relkinds del SQL son exactamente los declarados.
    const enElSql = [...sql.matchAll(/'([a-z])'/g)].map((m) => m[1]).sort();
    expect(enElSql).toEqual([...RELKINDS_DEL_DESTINO].sort());
  });

  it("cubre vistas ('v'/'m'), que es justo lo que `pg_tables` omitía", () => {
    expect(RELKINDS_DEL_DESTINO).toContain("v");
    expect(KINDS_DE_LA_HUELLA).toContain("view");
    expect(CLASES_DE_RELACION.map((c) => c.kind).sort()).toEqual(["table", "view"]);
  });

  it("rechaza un nombre de esquema que no sea un identificador simple", () => {
    expect(() => sqlRelacionesDelDestino("public'; drop table users; --")).toThrow(/Esquema invalido/);
  });

  it("dr-drill.mjs lista su destino con el criterio compartido y ya NO con pg_tables", () => {
    const fuente = leer("../../../../scripts/backup/dr-drill.mjs");
    expect(fuente).toContain("sqlRelacionesDelDestino");
    expect(fuente, "volvió a consultar pg_tables: omite vistas y la divergencia regresa").not.toMatch(
      /from\s+pg_tables/i,
    );
  });

  it("restore-from-json.mjs sigue listando su destino con listTargetTables", () => {
    expect(leer("../../../../scripts/backup/restore-from-json.mjs")).toContain("listTargetTables");
  });

  it("REGRESIÓN: un destino con el esquema real de DermaLand recién migrado NO aborta", async () => {
    // Lo que PostgREST devolvió de verdad contra producción el 2026-08-06: las
    // relaciones declaradas por las migraciones, vista incluida. Con la huella
    // anterior (solo `create table`) esto lanzaba
    // «ABORTADO: el destino contiene tablas desconocidas (inventory_stock_by_lot)».
    const huella = buildDermaLandFootprint();
    const definitions = Object.fromEntries(
      [...new Set([...huella, "inventory_stock_by_lot"])].map((n) => [n, {}]),
    );
    const expuestas = await listTargetTables({
      url: "https://destino-nuevo.supabase.co",
      key: "service_role-del-destino",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ definitions }) }),
      warn: () => {},
    });

    expect(expuestas).toContain("inventory_stock_by_lot");
    expect(() =>
      assertSafeTarget({ tables: expuestas, confirm: "si", isProduction: false, footprint: huella }),
    ).not.toThrow();
  });

  it("y sigue abortando con una relación que NO es de DermaLand", async () => {
    const huella = buildDermaLandFootprint();
    const definitions = Object.fromEntries([...huella, "csl_equipos"].map((n) => [n, {}]));
    const expuestas = await listTargetTables({
      url: "https://destino-ajeno.supabase.co",
      key: "k",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ definitions }) }),
      warn: () => {},
    });
    expect(() =>
      assertSafeTarget({ tables: expuestas, confirm: "si", isProduction: false, footprint: huella }),
    ).toThrow(/OTRO inquilino/);
  });
});
