import { describe, it, expect } from "vitest";
import {
  auditActionLabel,
  auditEntityLabel,
  formatAuditMetadata,
} from "./audit-labels";

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

  it("entidades del audit real mapeadas (no inglés/código)", () => {
    expect(auditEntityLabel("cash_register_session")).toBe("Sesión de caja");
    expect(auditEntityLabel("session")).toBe("Sesión");
    expect(auditEntityLabel("inventory_count")).toBe("Conteo físico");
  });

  it("entidad desconocida → prettify", () => {
    expect(auditEntityLabel("algo_raro")).toBe("Algo raro");
  });
});

describe("formatAuditMetadata", () => {
  it("formatea pares legibles y montos como moneda", () => {
    const out = formatAuditMetadata({ total: 2890, items: 3 });
    expect(out).toEqual([
      { label: "Total", value: "RD$2,890.00" },
      { label: "Ítems", value: "3" },
    ]);
    expect(formatAuditMetadata({ openingAmount: 5000 })).toEqual([
      { label: "Monto de apertura", value: "RD$5,000.00" },
    ]);
  });

  it("omite IDs internos (productId, *_id)", () => {
    const out = formatAuditMetadata({
      reason: "Etiqueta dañada",
      productId: "prod_lrp_001",
    });
    expect(out).toEqual([{ label: "Motivo", value: "Etiqueta dañada" }]);
  });

  it("metadata vacío o nulo → []", () => {
    expect(formatAuditMetadata(null)).toEqual([]);
    expect(formatAuditMetadata({})).toEqual([]);
  });
});
