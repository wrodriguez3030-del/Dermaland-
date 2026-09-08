import { describe, it, expect } from "vitest";
import { CAPACIDADES, ROLES_ASIGNABLES, AREAS, tieneCapacidad } from "./capacidades";
import { roleDefinitions } from "@/lib/mock-data/users";
import { puedeAccionDeRiesgo } from "@/features/auth/riesgo-operativo";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * La matriz de roles se DERIVA de las constantes que el servidor aplica. Estas
 * pruebas existen para que no vuelva a haber un panel que enseñe permisos que
 * el sistema no aplica —que es lo que hacían `/admin/roles` y `/admin/permisos`
 * leyendo `mockUsers`—.
 */
describe("capacidades por rol", () => {
  it("🔴 super_admin NO aparece: no se asigna desde la aplicación", () => {
    expect(ROLES_ASIGNABLES.map((r) => r.role)).not.toContain("super_admin");
    for (const c of CAPACIDADES) {
      expect(c.roles, `${c.id} ofrece super_admin`).not.toContain("super_admin");
    }
  });

  it("🔴 todo rol asignable existe de verdad en el sistema", () => {
    // Un rol inventado aquí se ofrecería en el selector y la base lo rechazaría
    // con un error de restricción al guardar.
    const reales = new Set(roleDefinitions.map((r) => r.key));
    for (const r of ROLES_ASIGNABLES) {
      expect(reales.has(r.role), `el rol «${r.role}» no existe en roleDefinitions`).toBe(true);
    }
  });

  it("🔴 ninguna capacidad lista un rol que no se pueda asignar", () => {
    const asignables = new Set(ROLES_ASIGNABLES.map((r) => r.role));
    for (const c of CAPACIDADES) {
      for (const rol of c.roles) {
        expect(asignables.has(rol), `${c.id} lista «${rol}», que no es asignable`).toBe(true);
      }
    }
  });

  it("🔴 la matriz dice lo MISMO que la función que autoriza de verdad", () => {
    // Si alguien cambia `puedeAccionDeRiesgo` y la matriz no se entera, el
    // panel promete una cosa y el sistema hace otra.
    const riesgo = CAPACIDADES.find((c) => c.id === "riesgo");
    expect(riesgo).toBeDefined();
    for (const r of ROLES_ASIGNABLES) {
      expect(
        tieneCapacidad(riesgo!, r.role),
        `«${r.role}»: la matriz dice ${tieneCapacidad(riesgo!, r.role)} y puedeAccionDeRiesgo dice ${puedeAccionDeRiesgo(r.role)}`,
      ).toBe(puedeAccionDeRiesgo(r.role));
    }
  });

  it("🔴 gestionar usuarios y claves es SOLO de administradores", () => {
    const usuarios = CAPACIDADES.find((c) => c.id === "usuarios");
    expect(usuarios?.roles).toEqual(
      BUSINESS_ADMIN_ROLES.filter((r) => r !== "super_admin"),
    );
    expect(usuarios?.roles).not.toContain("manager");
    expect(usuarios?.roles).not.toContain("cashier");
  });

  it("el administrador puede todo lo que se lista", () => {
    // No es cosmético: una capacidad de la que el admin quedara fuera sería un
    // rincón del sistema donde el dueño no puede entrar.
    for (const c of CAPACIDADES) {
      expect(c.roles, `el admin no puede «${c.etiqueta}»`).toContain("admin");
    }
  });

  it("el auditor no cambia nada", () => {
    const escriben = ["usuarios", "sucursales", "riesgo", "catalogo", "inventario", "credito"];
    for (const id of escriben) {
      const c = CAPACIDADES.find((x) => x.id === id);
      expect(c?.roles, `el auditor puede «${c?.etiqueta}»`).not.toContain("auditor");
    }
  });

  it("las insignias de riesgo y 2FA salen de las funciones reales", () => {
    for (const r of ROLES_ASIGNABLES) {
      expect(r.riesgo).toBe(puedeAccionDeRiesgo(r.role));
    }
    expect(ROLES_ASIGNABLES.find((r) => r.role === "admin")?.dosFactores).toBe(true);
    expect(ROLES_ASIGNABLES.find((r) => r.role === "cashier")?.dosFactores).toBe(false);
  });

  it("hay áreas y todas tienen al menos una capacidad", () => {
    expect(AREAS.length).toBeGreaterThan(3);
    for (const a of AREAS) {
      expect(CAPACIDADES.filter((c) => c.area === a).length).toBeGreaterThan(0);
    }
  });
});
