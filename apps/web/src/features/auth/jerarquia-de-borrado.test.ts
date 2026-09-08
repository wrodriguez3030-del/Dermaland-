import { describe, expect, it } from "vitest";
import { puedeEliminarA } from "./jerarquia-de-borrado";
import { puedeGestionarClaveDe } from "./jerarquia-de-claves";

/**
 * Quién puede BORRAR a quién.
 *
 * Es la misma jerarquía que la de las claves —quien puede apoderarse de una
 * cuenta ya puede todo lo que esa cuenta puede— salvo en un punto: la propia
 * cuenta, NO. Esa diferencia es la que estas pruebas existen para fijar; si
 * alguien «simplifica» reusando `puedeGestionarClaveDe` a secas, un
 * administrador podría borrarse a sí mismo y dejar el negocio sin quien
 * administre, sin ninguna pantalla desde la que arreglarlo.
 */

const admin = { id: "u-admin", role: "admin", isPlatformAdmin: false };
const superAdmin = { id: "u-super", role: "super_admin", isPlatformAdmin: true };
const otroAdmin = { id: "u-admin-2", role: "admin" };
const cajera = { id: "u-caja", role: "cashier" };
const gerente = { id: "u-ger", role: "manager", isPlatformAdmin: false };

describe("puedeEliminarA", () => {
  it("🔴 NADIE se borra a sí mismo, ni el súper administrador", () => {
    expect(puedeEliminarA(admin, { id: admin.id, role: admin.role })).toBe(false);
    expect(puedeEliminarA(superAdmin, { id: superAdmin.id, role: superAdmin.role })).toBe(false);
    // Y es EXACTAMENTE aquí donde se aparta de la de las claves, que sí deja.
    expect(puedeGestionarClaveDe(admin, { id: admin.id, role: admin.role })).toBe(true);
  });

  it("un administrador borra a quien no es administrador", () => {
    expect(puedeEliminarA(admin, cajera)).toBe(true);
  });

  it("🔴 un administrador NO borra a otro administrador: son pares", () => {
    expect(puedeEliminarA(admin, otroAdmin)).toBe(false);
  });

  it("el súper administrador sí borra a un administrador", () => {
    expect(puedeEliminarA(superAdmin, otroAdmin)).toBe(true);
  });

  it("🔴 a un súper administrador no lo borra nadie, ni otro súper", () => {
    expect(puedeEliminarA(admin, { id: "x", role: "super_admin" })).toBe(false);
    expect(puedeEliminarA(superAdmin, { id: "x", role: "super_admin" })).toBe(false);
    expect(puedeEliminarA(superAdmin, { id: "x", role: "admin", isPlatformAdmin: true })).toBe(false);
  });

  it("🔴 `manager` no borra a nadie, aunque pueda dar de alta personal", () => {
    // Crear una ficha y hacer desaparecer a una persona no son lo mismo.
    expect(puedeEliminarA(gerente, cajera)).toBe(false);
  });

  it("fuera del caso «uno mismo», decide lo mismo que la de las claves", () => {
    const actores = [admin, superAdmin, gerente];
    const objetivos = [otroAdmin, cajera, { id: "x", role: "super_admin" }, { id: "y", role: "vendedor" }];
    for (const a of actores) {
      for (const o of objetivos) {
        expect(puedeEliminarA(a, o), `${a.role} → ${o.role}`).toBe(puedeGestionarClaveDe(a, o));
      }
    }
  });
});
