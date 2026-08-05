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

  it("captura TODAS las cláusulas add column de un alter table con varias (caso real 0019_sale_seller.sql)", () => {
    const sql = `
      alter table proformas
        add column if not exists seller_id uuid references users(id),
        add column if not exists seller_name text;
    `;
    expect(extractObjects(sql)).toEqual([
      { kind: "column", name: "proformas.seller_id" },
      { kind: "column", name: "proformas.seller_name" },
    ]);
  });

  it("captura las 7 columnas de un alter table con 7 cláusulas add column (caso real 0014_billing_settings_ecf.sql)", () => {
    const sql = `
      alter table cash_closings
        add column if not exists ecf_percentage numeric(5,2),
        add column if not exists ecf_strategy text,
        add column if not exists ecf_target_amount numeric(14,2),
        add column if not exists ecf_generated_amount numeric(14,2),
        add column if not exists ecf_pending_amount numeric(14,2),
        add column if not exists ecf_rounding_difference numeric(14,2),
        add column if not exists ecf_generation_status text;
    `;
    expect(extractObjects(sql)).toEqual([
      { kind: "column", name: "cash_closings.ecf_percentage" },
      { kind: "column", name: "cash_closings.ecf_strategy" },
      { kind: "column", name: "cash_closings.ecf_target_amount" },
      { kind: "column", name: "cash_closings.ecf_generated_amount" },
      { kind: "column", name: "cash_closings.ecf_pending_amount" },
      { kind: "column", name: "cash_closings.ecf_rounding_difference" },
      { kind: "column", name: "cash_closings.ecf_generation_status" },
    ]);
  });

  it("distingue dos sentencias alter table sobre tablas distintas en el mismo archivo", () => {
    const sql = `
      alter table clients
        add column if not exists credit_limit numeric(14,2),
        add column if not exists credit_days integer;
      alter table proformas
        add column if not exists due_date date;
    `;
    expect(extractObjects(sql)).toEqual([
      { kind: "column", name: "clients.credit_limit" },
      { kind: "column", name: "clients.credit_days" },
      { kind: "column", name: "proformas.due_date" },
    ]);
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
