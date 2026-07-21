import { describe, it, expect } from "vitest";
import { auditActionLabel, auditEntityLabel } from "./audit-labels";

describe("auditActionLabel", () => {
  it("traduce acciones conocidas a texto legible", () => {
    expect(auditActionLabel("sale.whatsapp_share")).toBe(
      "Factura enviada por WhatsApp",
    );
    expect(auditActionLabel("proforma.create")).toBe("Proforma creada");
    expect(auditActionLabel("firmar")).toBe("Comprobante firmado");
    expect(auditActionLabel("cash_register.open")).toBe("Caja abierta");
  });

  it("acción desconocida → prettify (sin puntos/guiones)", () => {
    const label = auditActionLabel("algo.no_mapeado");
    expect(label).toBe("Algo no mapeado");
    expect(label).not.toContain(".");
    expect(label).not.toContain("_");
  });
});

describe("auditEntityLabel", () => {
  it("traduce entidades conocidas", () => {
    expect(auditEntityLabel("proforma")).toBe("Comprobante");
    expect(auditEntityLabel("client")).toBe("Cliente");
    expect(auditEntityLabel("branch")).toBe("Sucursal");
  });

  it("entidad desconocida → prettify", () => {
    expect(auditEntityLabel("cash_closing")).toBe("Cierre de caja");
    expect(auditEntityLabel("algo_raro")).toBe("Algo raro");
  });
});
