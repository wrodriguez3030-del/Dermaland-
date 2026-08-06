import { describe, it, expect } from "vitest";
import { assertSafeTarget } from "../../../../scripts/backup/lib/assert-safe-target.mjs";

const ok = { tables: [], confirm: "si", isProduction: false };

// Nombres REALES de produccion (verificados 2026-08-05 vía
// information_schema.tables contra sntcvyozbhrgicwmtcoh). La ronda de
// correccion 1 encontró que la huella anterior tenía "sales", "sale_items",
// "categories" y "cash_sessions" — ninguno existe. DermaLand factura con
// `proformas`/`proforma_items`, no con `sales`/`sale_items`.
const FOOTPRINT_REAL = [
  "businesses",
  "branches",
  "users",
  "clients",
  "products",
  "product_lots",
  "proformas",
  "proforma_items",
  "product_categories",
  "cash_register_sessions",
  "cash_registers",
  "inventory_movements",
  "audit_logs",
  "laboratories",
  "brands",
  "payments",
];

describe("assertSafeTarget", () => {
  it("acepta un destino vacío con confirmación", () => {
    expect(() => assertSafeTarget(ok)).not.toThrow();
  });

  it("acepta un destino que ya contiene DermaLand (huella real, provista por quien llama)", () => {
    expect(() =>
      assertSafeTarget({
        ...ok,
        tables: ["businesses", "products", "proformas", "proforma_items"],
        footprint: FOOTPRINT_REAL,
      }),
    ).not.toThrow();
  });

  it("rechaza el proyecto de producción", () => {
    expect(() => assertSafeTarget({ ...ok, isProduction: true })).toThrow(
      /produccion/i,
    );
  });

  it("rechaza un destino con tablas de csl-app", () => {
    expect(() =>
      assertSafeTarget({ ...ok, tables: ["csl_equipos", "csl_user_profiles"] }),
    ).toThrow(/csl_equipos/);
  });

  it("rechaza un destino con tablas de PalusaApp", () => {
    expect(() => assertSafeTarget({ ...ok, tables: ["palusa_tenants"] })).toThrow(
      /palusa_tenants/,
    );
  });

  it("rechaza tablas desconocidas: deny-by-default", () => {
    // No basta con no reconocer csl_/palusa_. Cualquier tabla ajena a la
    // huella de DermaLand aborta: el modo de falla que hay que evitar es
    // escribir sobre datos de alguien mas.
    expect(() => assertSafeTarget({ ...ok, tables: ["facturas_de_otro"] })).toThrow(
      /desconocid/i,
    );
  });

  it("rechaza si falta la confirmación explícita", () => {
    expect(() => assertSafeTarget({ ...ok, confirm: "" })).toThrow(
      /DERMALAND_DR_CONFIRM/,
    );
  });

  // --- Cobertura nueva: la huella ya NO se hardcodea dentro de la guarda
  // (ronda de correccion 1). assertSafeTarget se mantiene pura — sin leer
  // disco — y recibe `footprint` como parametro, construido por quien llama
  // (ver lib/dermaland-footprint.mjs). Estas pruebas fijan ese contrato.

  it("sin footprint explícito, rechaza incluso tablas reales de DermaLand (deny-by-default, sin lista hardcodeada)", () => {
    // Antes de la correccion, "businesses"/"proformas" se aceptaban porque
    // vivían hardcodeados dentro de la guarda. Ahora, si quien llama no
    // arma la huella, no hay ningún nombre reconocido — ni siquiera los
    // reales — y la guarda aborta igual: es la unica postura segura.
    expect(() =>
      assertSafeTarget({ ...ok, tables: ["businesses", "proformas"] }),
    ).toThrow(/desconocid/i);
  });

  it("acepta un footprint provisto como Set (no solo array)", () => {
    expect(() =>
      assertSafeTarget({
        ...ok,
        tables: ["businesses"],
        footprint: new Set(["businesses"]),
      }),
    ).not.toThrow();
  });

  it("rechaza una tabla real de DermaLand que NO está en el footprint provisto", () => {
    // El footprint manda: si quien llama pasó una huella incompleta, la
    // guarda no "adivina" que proforma_items es de DermaLand.
    expect(() =>
      assertSafeTarget({
        ...ok,
        tables: ["proforma_items"],
        footprint: ["businesses"],
      }),
    ).toThrow(/proforma_items/);
  });
});
