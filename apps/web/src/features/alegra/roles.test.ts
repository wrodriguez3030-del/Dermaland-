import { describe, it, expect } from "vitest";
import { ALEGRA_READ_ROLES, ALEGRA_SYNC_ROLES, permiteAlegra } from "./roles";

describe("permiteAlegra", () => {
  it("deja pasar a los roles permitidos y frena al resto", () => {
    expect(permiteAlegra(ALEGRA_READ_ROLES, "cashier")).toBe(true);
    expect(permiteAlegra(ALEGRA_READ_ROLES, "vendedor")).toBe(true);
    // `inventory` NO está en la lista: la API se lo niega, así que la pantalla
    // tampoco puede enseñárselo.
    expect(permiteAlegra(ALEGRA_READ_ROLES, "inventory")).toBe(false);
  });

  it("disparar la sincronización es más estrecho que mirar el historial", () => {
    expect(permiteAlegra(ALEGRA_SYNC_ROLES, "admin")).toBe(true);
    expect(permiteAlegra(ALEGRA_SYNC_ROLES, "manager")).toBe(true);
    expect(permiteAlegra(ALEGRA_SYNC_ROLES, "cashier")).toBe(false);
    expect(permiteAlegra(ALEGRA_SYNC_ROLES, "auditor")).toBe(false);
  });

  it("el administrador de plataforma entra siempre, como en authorizeRole", () => {
    expect(permiteAlegra(ALEGRA_SYNC_ROLES, "inventory", true)).toBe(true);
    expect(permiteAlegra(ALEGRA_READ_ROLES, "inventory", true)).toBe(true);
  });
});
