import { describe, it, expect } from "vitest";
import {
  stripSqlComments,
  extractObjects,
  classify,
} from "../../../../scripts/lib/migration-objects.mjs";

describe("stripSqlComments", () => {
  it("quita comentarios de línea y de bloque", () => {
    const sql = `
      -- create table fantasma (id uuid);
      create table real (id uuid);
      /* create table otro_fantasma (id uuid); */
    `;
    const limpio = stripSqlComments(sql);
    expect(limpio).not.toContain("fantasma");
    expect(limpio).toContain("real");
  });
});

describe("extractObjects", () => {
  it("reconoce tablas, columnas, funciones, políticas e índices", () => {
    const sql = `
      create table if not exists public.products (id uuid primary key);
      alter table public.products add column if not exists barcode text;
      create or replace function public.emit_sale_atomic() returns void as $$ begin end; $$ language plpgsql;
      create policy "p_select" on public.products for select using (true);
      create unique index idx_products_barcode on public.products (barcode);
    `;
    expect(extractObjects(sql)).toEqual([
      { kind: "table", name: "products" },
      { kind: "column", name: "products.barcode" },
      { kind: "function", name: "emit_sale_atomic" },
      { kind: "policy", name: "products.p_select" },
      { kind: "index", name: "idx_products_barcode" },
    ]);
  });

  it("ignora DDL comentado", () => {
    expect(extractObjects("-- create table fantasma (id uuid);")).toEqual([]);
  });

  it("devuelve vacío para una migración que solo inserta datos", () => {
    const seed = `insert into public.laboratories (name) values ('ISDIN');`;
    expect(extractObjects(seed)).toEqual([]);
  });
});

describe("classify", () => {
  const objs = [
    { kind: "table", name: "products" },
    { kind: "column", name: "products.barcode" },
  ];

  it("APLICADA cuando todos sus objetos existen", () => {
    const existing = new Set(["table:products", "column:products.barcode"]);
    expect(classify(objs, existing)).toBe("APLICADA");
  });

  it("NO_APLICADA cuando no existe ninguno", () => {
    expect(classify(objs, new Set())).toBe("NO_APLICADA");
  });

  it("PARCIAL cuando existen unos sí y otros no", () => {
    expect(classify(objs, new Set(["table:products"]))).toBe("PARCIAL");
  });

  it("INDETERMINADA cuando la migración no declara objetos", () => {
    // Una migración de solo datos (ej. 0016_laboratories_seed) no declara
    // objetos. Sin este caso, "cero de cero existen" se clasificaría como
    // APLICADA y un `repair` la marcaría aplicada sin haberlo comprobado.
    expect(classify([], new Set(["table:products"]))).toBe("INDETERMINADA");
  });
});
