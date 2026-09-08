import { describe, it, expect } from "vitest";
import { puedeGestionarClaveDe } from "./jerarquia-de-claves";

/**
 * Con el ojo enseñando claves en claro, esta tabla es lo que impide que un
 * administrador se apodere de la cuenta del dueño. Cada caso está escrito
 * aparte a propósito: un bucle sobre una tabla se lee bonito y esconde cuál
 * de las combinaciones dejó de cumplirse.
 */
const admin = { id: "a1", role: "admin", isPlatformAdmin: false };
const otroAdmin = { id: "a2", role: "admin" };
const superAdmin = { id: "s1", role: "super_admin", isPlatformAdmin: true };
const otroSuper = { id: "s2", role: "super_admin", isPlatformAdmin: true };
const vendedora = { id: "v1", role: "vendedor" };
const gerente = { id: "g1", role: "manager", isPlatformAdmin: false };
const cajera = { id: "c1", role: "cashier", isPlatformAdmin: false };

describe("quién puede fijar y ver la clave de quién", () => {
  it("uno mismo, siempre — nadie se queda fuera de su propia cuenta", () => {
    expect(puedeGestionarClaveDe(cajera, { id: "c1", role: "cashier" })).toBe(true);
    expect(puedeGestionarClaveDe(gerente, { id: "g1", role: "manager" })).toBe(true);
    expect(puedeGestionarClaveDe(superAdmin, { id: "s1", role: "super_admin" })).toBe(true);
  });

  it("un administrador, sobre quien no lo es: sí", () => {
    expect(puedeGestionarClaveDe(admin, vendedora)).toBe(true);
    expect(puedeGestionarClaveDe(admin, cajera)).toBe(true);
    expect(puedeGestionarClaveDe(admin, gerente)).toBe(true);
  });

  it("🔴 un administrador, sobre OTRO administrador: NO", () => {
    // Si no, cualquier admin toma la cuenta de su par reiniciándole la clave.
    expect(puedeGestionarClaveDe(admin, otroAdmin)).toBe(false);
  });

  it("🔴 nadie sobre el súper administrador — tampoco otro súper", () => {
    expect(puedeGestionarClaveDe(admin, superAdmin)).toBe(false);
    expect(puedeGestionarClaveDe(otroSuper, superAdmin)).toBe(false);
  });

  it("el súper administrador, sobre un administrador: sí", () => {
    expect(puedeGestionarClaveDe(superAdmin, otroAdmin)).toBe(true);
    expect(puedeGestionarClaveDe(superAdmin, vendedora)).toBe(true);
  });

  it("🔴 el gerente NUNCA gestiona claves ajenas, aunque dé de alta personal", () => {
    expect(puedeGestionarClaveDe(gerente, vendedora)).toBe(false);
    expect(puedeGestionarClaveDe(gerente, cajera)).toBe(false);
  });

  it("🔴 una cajera no gestiona la clave de nadie más", () => {
    expect(puedeGestionarClaveDe(cajera, vendedora)).toBe(false);
    expect(puedeGestionarClaveDe(cajera, admin)).toBe(false);
  });

  it("🔴 el rol con otras mayúsculas o espacios no se cuela", () => {
    // Una discrepancia de mayúsculas aquí no molesta: abre una puerta callada.
    expect(puedeGestionarClaveDe({ id: "x", role: " Admin ", isPlatformAdmin: false }, vendedora)).toBe(true);
    expect(puedeGestionarClaveDe(admin, { id: "y", role: " ADMIN " })).toBe(false);
    expect(puedeGestionarClaveDe(admin, { id: "z", role: "Super_Admin" })).toBe(false);
  });

  it("🔴 `isPlatformAdmin` manda aunque el rol no diga super_admin", () => {
    // El súper administrador de plataforma puede llevar `role: admin`.
    const plataforma = { id: "p1", role: "admin", isPlatformAdmin: true };
    expect(puedeGestionarClaveDe(plataforma, otroAdmin)).toBe(true);
    // Y protege al objetivo aunque su rol diga solo «admin».
    expect(puedeGestionarClaveDe(admin, { id: "p1", role: "admin", isPlatformAdmin: true })).toBe(false);
  });
});
