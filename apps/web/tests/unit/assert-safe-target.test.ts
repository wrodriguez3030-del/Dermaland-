import { describe, it, expect } from "vitest";
import { assertSafeTarget } from "../../../../scripts/backup/lib/assert-safe-target.mjs";

const ok = { tables: [], confirm: "si", isProduction: false };

describe("assertSafeTarget", () => {
  it("acepta un destino vacío con confirmación", () => {
    expect(() => assertSafeTarget(ok)).not.toThrow();
  });

  it("acepta un destino que ya contiene DermaLand", () => {
    expect(() =>
      assertSafeTarget({ ...ok, tables: ["businesses", "products", "sales"] }),
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
});
