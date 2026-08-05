import { describe, expect, it } from "vitest";
import type { UserRole } from "@/types";
import {
  DGII_PERMISSIONS,
  dgiiPermissionLabel,
  roleHasDgiiPermission,
  rolesForDgiiPermission,
  type DgiiPermission,
} from "./permissions";

const TODOS_LOS_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "cashier",
  "inventory",
  "supervisor",
  "auditor",
  "vendedor",
];

describe("permisos DGII — lo que estaba abierto", () => {
  it("inventario NO puede descargar el XML fiscal", () => {
    // Este es el agujero real: ocho rutas de /api/dgii no comprobaban rol, y
    // la RLS valida el business_id y no el rol (DL-01). El usuario de
    // inventario podía bajarse el XML FIRMADO de cualquier factura.
    expect(roleHasDgiiPermission("inventory", "dgii.download_xml")).toBe(false);
  });

  it("el mostrador tampoco: el XML firmado no es un recibo", () => {
    for (const rol of ["cashier", "vendedor", "supervisor"] as const) {
      expect(roleHasDgiiPermission(rol, "dgii.download_xml"), rol).toBe(false);
    }
  });

  it("inventario no toca NADA de lo fiscal", () => {
    for (const p of DGII_PERMISSIONS) {
      expect(roleHasDgiiPermission("inventory", p), p).toBe(false);
    }
  });
});

describe("permisos DGII — el certificado", () => {
  it("solo admin gestiona el certificado", () => {
    expect(roleHasDgiiPermission("admin", "dgii.manage_certificate")).toBe(true);
    expect(roleHasDgiiPermission("super_admin", "dgii.manage_certificate")).toBe(true);
    for (const rol of ["manager", "supervisor", "cashier", "vendedor", "auditor", "inventory"] as const) {
      expect(roleHasDgiiPermission(rol, "dgii.manage_certificate"), rol).toBe(false);
    }
  });

  it("quien emite una factura NO obtiene acceso al certificado", () => {
    // §25 del pliego, dicho tal cual.
    const emiten = TODOS_LOS_ROLES.filter((r) => roleHasDgiiPermission(r, "dgii.issue"));
    const conCertificado = emiten.filter((r) =>
      roleHasDgiiPermission(r, "dgii.manage_certificate"),
    );
    // Solo los admin, que ya lo tenían por ser admin.
    expect(conCertificado).toEqual(["super_admin", "admin"]);
  });
});

describe("permisos DGII — encender producción", () => {
  it("SOLO el dueño de la plataforma", () => {
    // Encender la emisión real tiene consecuencias legales ante la DGII.
    expect(rolesForDgiiPermission("dgii.production_enable")).toEqual(["super_admin"]);
    expect(roleHasDgiiPermission("admin", "dgii.production_enable")).toBe(false);
  });

  it("ser admin no implica poder encenderla", () => {
    // "SUPER_ADMIN no debe implicar que cualquier usuario administrativo tenga
    // acceso fiscal" — §25.
    expect(roleHasDgiiPermission("manager", "dgii.production_enable")).toBe(false);
  });
});

describe("permisos DGII — el mostrador sigue trabajando", () => {
  it("caja y vendedor pueden emitir y consultar", () => {
    for (const rol of ["cashier", "vendedor"] as const) {
      expect(roleHasDgiiPermission(rol, "dgii.issue"), rol).toBe(true);
      expect(roleHasDgiiPermission(rol, "dgii.query_status"), rol).toBe(true);
      expect(roleHasDgiiPermission(rol, "dgii.view"), rol).toBe(true);
    }
  });

  it("pero no configuran ni gestionan secuencias", () => {
    for (const rol of ["cashier", "vendedor", "supervisor"] as const) {
      expect(roleHasDgiiPermission(rol, "dgii.configure"), rol).toBe(false);
      expect(roleHasDgiiPermission(rol, "dgii.manage_sequences"), rol).toBe(false);
    }
  });
});

describe("permisos DGII — el auditor", () => {
  it("mira y no toca", () => {
    expect(roleHasDgiiPermission("auditor", "dgii.view")).toBe(true);
    expect(roleHasDgiiPermission("auditor", "dgii.audit_view")).toBe(true);
    for (const p of DGII_PERMISSIONS.filter(
      (x) => x !== "dgii.view" && x !== "dgii.audit_view",
    )) {
      expect(roleHasDgiiPermission("auditor", p), p).toBe(false);
    }
  });
});

describe("permisos DGII — integridad de la tabla", () => {
  it("son los trece del pliego, sin repetir", () => {
    expect(new Set(DGII_PERMISSIONS).size).toBe(DGII_PERMISSIONS.length);
    for (const p of DGII_PERMISSIONS) expect(p.startsWith("dgii.")).toBe(true);
  });

  it("ningún permiso se queda sin roles: un permiso vacío es una pantalla muerta", () => {
    for (const p of DGII_PERMISSIONS) {
      expect(rolesForDgiiPermission(p).length, p).toBeGreaterThan(0);
    }
  });

  it("super_admin puede con todo: si no, el dueño se queda fuera de su propio sistema", () => {
    for (const p of DGII_PERMISSIONS) {
      expect(roleHasDgiiPermission("super_admin", p), p).toBe(true);
    }
  });

  it("cada permiso tiene etiqueta legible y no es la clave cruda", () => {
    for (const p of DGII_PERMISSIONS) {
      const etiqueta = dgiiPermissionLabel(p as DgiiPermission);
      expect(etiqueta.length).toBeGreaterThan(0);
      expect(etiqueta).not.toBe(p);
    }
  });
});
