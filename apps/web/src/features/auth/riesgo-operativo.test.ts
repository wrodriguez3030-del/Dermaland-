import { describe, it, expect } from "vitest";
import { puedeAccionDeRiesgo } from "./riesgo-operativo";
import type { UserRole } from "@/types";

/**
 * Decisión del dueño (07/09/2026): borrar y editar es de administradores. Una
 * cajera necesita cobrar y consultar; no necesita poder borrar la ficha de un
 * cliente con tres años de historial.
 *
 * Se prueban TODOS los roles, uno por uno y contra el literal, para que añadir
 * un rol nuevo obligue a decidir de qué lado cae en vez de heredar un permiso
 * por descuido.
 */

const TODOS: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "inventory",
  "supervisor",
  "auditor",
  "vendedor",
];

describe("puedeAccionDeRiesgo", () => {
  it("🔴 solo administradores", () => {
    expect(puedeAccionDeRiesgo("super_admin")).toBe(true);
    expect(puedeAccionDeRiesgo("admin")).toBe(true);
  });

  it("🔴 NINGÚN otro rol puede borrar ni editar", () => {
    for (const rol of TODOS.filter((r) => r !== "super_admin" && r !== "admin")) {
      expect(puedeAccionDeRiesgo(rol), `el rol «${rol}» NO debería poder`).toBe(false);
    }
  });

  it("🔴 la cajera y la vendedora, que son quienes más usan el sistema, NO pueden", () => {
    // Nombradas a propósito: son los dos roles que están todo el día delante de
    // la pantalla, y por tanto los que más veces pueden pulsar sin querer.
    expect(puedeAccionDeRiesgo("cashier")).toBe(false);
    expect(puedeAccionDeRiesgo("vendedor")).toBe(false);
  });

  it("un rol nuevo cae del lado seguro mientras nadie decida", () => {
    // Si mañana aparece «recepcion» y nadie la añade a la lista, no hereda el
    // permiso: el silencio es «no puede», no «puede».
    expect(puedeAccionDeRiesgo("recepcion" as UserRole)).toBe(false);
  });

  it("se cubren TODOS los roles del tipo, sin olvidar ninguno", () => {
    // Suelo contra la prueba vacía: si `TODOS` se quedara corto, el barrido de
    // arriba pasaría sin haber mirado los roles que faltan.
    expect(TODOS).toHaveLength(8);
    expect(new Set(TODOS).size).toBe(8);
  });
});
