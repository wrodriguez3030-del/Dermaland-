import { describe, expect, it } from "vitest";
import { customerAccountsEnabled } from "./availability";

describe("customerAccountsEnabled", () => {
  it("apagadas por defecto", () => {
    // Fail-closed: una puerta que no abre es peor que ninguna puerta. Mientras
    // Supabase no tenga SMTP propio, el registro falla al segundo cliente de la
    // hora, y el que se queda fuera no vuelve.
    expect(customerAccountsEnabled({})).toBe(false);
    expect(customerAccountsEnabled({ STOREFRONT_ACCOUNTS_ENABLED: "" })).toBe(
      false,
    );
  });

  it("se encienden solo con el valor exacto", () => {
    expect(customerAccountsEnabled({ STOREFRONT_ACCOUNTS_ENABLED: "true" })).toBe(
      true,
    );
    // Con espacios alrededor también: es lo que pasa al pegar en un panel web.
    expect(
      customerAccountsEnabled({ STOREFRONT_ACCOUNTS_ENABLED: " true " }),
    ).toBe(true);
  });

  it("nada parecido las enciende por accidente", () => {
    for (const v of ["TRUE", "True", "1", "sí", "yes", "on", "false", "0"]) {
      expect(customerAccountsEnabled({ STOREFRONT_ACCOUNTS_ENABLED: v })).toBe(
        false,
      );
    }
  });
});
