import { describe, it, expect } from "vitest";
import {
  allPermissions,
  DGII_RBAC_PENDING_KEYS,
  DGII_PERMISSION_MODULES_ORDER,
} from "./users";

/** Las 18 keys que el catálogo mock debe declarar como pendientes RLS. */
const EXPECTED_DGII_KEYS: ReadonlyArray<string> = [
  "dgii:configure",
  "dgii:certificate:upload",
  "dgii:sequences:manage",
  "dgii:invoices:generate_xml",
  "dgii:invoices:validate_xml",
  "dgii:invoices:sign",
  "dgii:invoices:send",
  "dgii:invoices:check_status",
  "dgii:invoices:download_xml",
  "dgii:invoices:download_pdf",
  "dgii:credit_notes:create",
  "dgii:reports:view",
  "dgii:certification:run_tests",
  "cash:open",
  "cash:close",
  "cash:change_closing_percentage",
  "cash:authorize_below_100_percent",
  "cash:reverse_closing",
];

describe("allPermissions — catálogo DGII / cash granular", () => {
  it("incluye los 18 permisos DGII/cash pendientes de RLS", () => {
    const set = new Set(allPermissions.map((p) => p.key));
    for (const key of EXPECTED_DGII_KEYS) {
      expect(set.has(key), `Falta el permiso '${key}'`).toBe(true);
    }
  });

  it("DGII_RBAC_PENDING_KEYS coincide exactamente con la lista esperada", () => {
    expect(DGII_RBAC_PENDING_KEYS.size).toBe(EXPECTED_DGII_KEYS.length);
    for (const k of EXPECTED_DGII_KEYS) {
      expect(DGII_RBAC_PENDING_KEYS.has(k)).toBe(true);
    }
  });

  it("todos los keys pendientes están realmente en allPermissions", () => {
    const allKeys = new Set(allPermissions.map((p) => p.key));
    for (const k of DGII_RBAC_PENDING_KEYS) {
      expect(allKeys.has(k), `Pending '${k}' falta en allPermissions`).toBe(
        true,
      );
    }
  });

  it("ningún key se duplica en allPermissions", () => {
    const keys = allPermissions.map((p) => p.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("cada permiso DGII pendiente tiene descripción y módulo", () => {
    for (const p of allPermissions) {
      if (DGII_RBAC_PENDING_KEYS.has(p.key)) {
        expect(p.module.length).toBeGreaterThan(0);
        expect(p.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("DGII_PERMISSION_MODULES_ORDER cubre los módulos usados por permisos pendientes", () => {
    const modulesInUse = new Set(
      allPermissions
        .filter((p) => DGII_RBAC_PENDING_KEYS.has(p.key))
        .map((p) => p.module),
    );
    for (const m of modulesInUse) {
      expect(
        DGII_PERMISSION_MODULES_ORDER.includes(m),
        `Módulo '${m}' no listado en el orden`,
      ).toBe(true);
    }
  });

  it("permisos cash:* incluyen los críticos del cierre fiscal", () => {
    const cashKeys = allPermissions
      .map((p) => p.key)
      .filter((k) => k.startsWith("cash:"));
    expect(cashKeys).toContain("cash:change_closing_percentage");
    expect(cashKeys).toContain("cash:authorize_below_100_percent");
    expect(cashKeys).toContain("cash:reverse_closing");
  });
});
