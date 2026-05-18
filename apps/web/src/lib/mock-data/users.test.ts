import { describe, it, expect } from "vitest";
import {
  allPermissions,
  DGII_RBAC_PENDING_KEYS,
  DGII_PERMISSION_MODULES_ORDER,
  permissionMatchesPattern,
  roleDefinitions,
  roleHasPermission,
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

describe("permissionMatchesPattern", () => {
  it("match exacto", () => {
    expect(permissionMatchesPattern("cash:open", "cash:open")).toBe(true);
    expect(permissionMatchesPattern("cash:open", "cash:close")).toBe(false);
  });

  it("wildcard `:*` cubre cualquier sub-permiso", () => {
    expect(permissionMatchesPattern("dgii:*", "dgii:configure")).toBe(true);
    expect(permissionMatchesPattern("dgii:*", "dgii:invoices:sign")).toBe(true);
    expect(permissionMatchesPattern("dgii:*", "cash:open")).toBe(false);
  });

  it("wildcard `*` cubre todo", () => {
    expect(permissionMatchesPattern("*", "cualquier:cosa")).toBe(true);
  });

  it("OR `a|b|c` expande al último segmento", () => {
    expect(
      permissionMatchesPattern(
        "dgii:invoices:generate_xml|sign",
        "dgii:invoices:sign",
      ),
    ).toBe(true);
    expect(
      permissionMatchesPattern(
        "dgii:invoices:generate_xml|sign",
        "dgii:invoices:send",
      ),
    ).toBe(false);
  });

  it("OR no se aplica a segmentos intermedios", () => {
    expect(
      permissionMatchesPattern(
        "cash:open|close",
        "cash:authorize_below_100_percent",
      ),
    ).toBe(false);
  });
});

describe("roleDefinitions — asignaciones DGII / cash", () => {
  function role(key: string) {
    const r = roleDefinitions.find((x) => x.key === key);
    if (!r) throw new Error(`Role ${key} not found`);
    return r;
  }

  describe("super_admin", () => {
    it("tiene todos los permisos DGII/cash vía wildcards", () => {
      const r = role("super_admin");
      for (const key of DGII_RBAC_PENDING_KEYS) {
        expect(
          roleHasPermission(r, key),
          `super_admin debería tener '${key}'`,
        ).toBe(true);
      }
    });
  });

  describe("admin", () => {
    it("tiene todos los permisos DGII y cash", () => {
      const r = role("admin");
      for (const key of DGII_RBAC_PENDING_KEYS) {
        expect(roleHasPermission(r, key), `admin debería tener '${key}'`).toBe(
          true,
        );
      }
    });
  });

  describe("manager", () => {
    const r = roleDefinitions.find((x) => x.key === "manager")!;

    it("tiene operación de facturación (generate/validate/sign/send/status/download)", () => {
      expect(roleHasPermission(r, "dgii:invoices:generate_xml")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:validate_xml")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:sign")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:send")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:check_status")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:download_xml")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:download_pdf")).toBe(true);
    });

    it("puede crear NC y ver reportes", () => {
      expect(roleHasPermission(r, "dgii:credit_notes:create")).toBe(true);
      expect(roleHasPermission(r, "dgii:reports:view")).toBe(true);
    });

    it("NO gestiona certificado ni secuencias ni configuración", () => {
      expect(roleHasPermission(r, "dgii:configure")).toBe(false);
      expect(roleHasPermission(r, "dgii:certificate:upload")).toBe(false);
      expect(roleHasPermission(r, "dgii:sequences:manage")).toBe(false);
    });

    it("abre/cierra caja y cambia %, pero NO autoriza < 100 ni reversa", () => {
      expect(roleHasPermission(r, "cash:open")).toBe(true);
      expect(roleHasPermission(r, "cash:close")).toBe(true);
      expect(roleHasPermission(r, "cash:change_closing_percentage")).toBe(true);
      expect(roleHasPermission(r, "cash:authorize_below_100_percent")).toBe(
        false,
      );
      expect(roleHasPermission(r, "cash:reverse_closing")).toBe(false);
    });
  });

  describe("cashier", () => {
    const r = roleDefinitions.find((x) => x.key === "cashier")!;

    it("genera XML (cobro tarjeta) y descarga PDF para cliente", () => {
      expect(roleHasPermission(r, "dgii:invoices:generate_xml")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:download_pdf")).toBe(true);
    });

    it("NO firma manualmente, NO envía, NO consulta status", () => {
      expect(roleHasPermission(r, "dgii:invoices:sign")).toBe(false);
      expect(roleHasPermission(r, "dgii:invoices:send")).toBe(false);
      expect(roleHasPermission(r, "dgii:invoices:check_status")).toBe(false);
    });

    it("abre y cierra su caja, pero NO cambia %, ni autoriza ni reversa", () => {
      expect(roleHasPermission(r, "cash:open")).toBe(true);
      expect(roleHasPermission(r, "cash:close")).toBe(true);
      expect(roleHasPermission(r, "cash:change_closing_percentage")).toBe(
        false,
      );
      expect(roleHasPermission(r, "cash:authorize_below_100_percent")).toBe(
        false,
      );
      expect(roleHasPermission(r, "cash:reverse_closing")).toBe(false);
    });

    it("NO crea notas de crédito (eso lo hace manager+)", () => {
      expect(roleHasPermission(r, "dgii:credit_notes:create")).toBe(false);
    });
  });

  describe("inventory", () => {
    const r = roleDefinitions.find((x) => x.key === "inventory")!;

    it("NO tiene NINGÚN permiso DGII o cash", () => {
      for (const key of DGII_RBAC_PENDING_KEYS) {
        expect(
          roleHasPermission(r, key),
          `inventory NO debería tener '${key}'`,
        ).toBe(false);
      }
    });
  });

  describe("supervisor (aprobador de cierres sensibles)", () => {
    const r = roleDefinitions.find((x) => x.key === "supervisor")!;

    it("autoriza cierres con % < 100 y reversa", () => {
      expect(roleHasPermission(r, "cash:authorize_below_100_percent")).toBe(
        true,
      );
      expect(roleHasPermission(r, "cash:reverse_closing")).toBe(true);
    });

    it("ve reportes fiscales", () => {
      expect(roleHasPermission(r, "dgii:reports:view")).toBe(true);
    });

    it("NO opera el flujo de emisión (no firma ni envía)", () => {
      expect(roleHasPermission(r, "dgii:invoices:sign")).toBe(false);
      expect(roleHasPermission(r, "dgii:invoices:send")).toBe(false);
      expect(roleHasPermission(r, "dgii:configure")).toBe(false);
    });
  });

  describe("auditor (solo lectura)", () => {
    const r = roleDefinitions.find((x) => x.key === "auditor")!;

    it("solo lectura DGII: reports + status + downloads", () => {
      expect(roleHasPermission(r, "dgii:reports:view")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:check_status")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:download_xml")).toBe(true);
      expect(roleHasPermission(r, "dgii:invoices:download_pdf")).toBe(true);
    });

    it("NO ejecuta NINGUNA acción de escritura DGII / cash", () => {
      const writeKeys = [
        "dgii:configure",
        "dgii:certificate:upload",
        "dgii:sequences:manage",
        "dgii:invoices:generate_xml",
        "dgii:invoices:sign",
        "dgii:invoices:send",
        "dgii:credit_notes:create",
        "dgii:certification:run_tests",
        "cash:open",
        "cash:close",
        "cash:change_closing_percentage",
        "cash:authorize_below_100_percent",
        "cash:reverse_closing",
      ];
      for (const key of writeKeys) {
        expect(
          roleHasPermission(r, key),
          `auditor NO debería tener '${key}'`,
        ).toBe(false);
      }
    });
  });

  it("todos los roles esperados existen en roleDefinitions", () => {
    const keys = roleDefinitions.map((r) => r.key);
    for (const k of [
      "super_admin",
      "admin",
      "manager",
      "cashier",
      "inventory",
      "supervisor",
      "auditor",
    ] as const) {
      expect(keys).toContain(k);
    }
  });
});
