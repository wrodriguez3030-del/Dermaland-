import { describe, expect, it } from "vitest";
import type { Proforma } from "@/types";
import {
  documentEditability,
  isDocumentEditable,
  pickEditableProformaFields,
} from "./editability";
import { canEditSales } from "@/features/billing/permissions";

const base = (status: Proforma["status"]): Pick<Proforma, "status"> => ({ status });

describe("documentEditability", () => {
  it("permite editar documentos pagados / emitidos (demo)", () => {
    expect(isDocumentEditable(base("paid"))).toBe(true);
    expect(isDocumentEditable(base("issued"))).toBe(true);
  });

  it("bloquea documentos anulados", () => {
    const r = documentEditability(base("cancelled"));
    expect(r.editable).toBe(false);
    expect(r.reason).toMatch(/anulad/i);
  });

  it("bloquea documentos emitidos fiscalmente (convertidos a e-CF)", () => {
    const r = documentEditability(base("converted_to_ecf"));
    expect(r.editable).toBe(false);
    expect(r.reason).toMatch(/nota de crédito|emitida fiscalmente/i);
  });
});

describe("pickEditableProformaFields — solo campos seguros", () => {
  it("filtra a cliente/notas y descarta lo fiscal", () => {
    const out = pickEditableProformaFields({
      customerName: "  Willian  ",
      customerPhone: "809",
      customerDocument: "",
      notes: "nota",
      // Campos fiscales que NUNCA deben pasar:
      total: 99999,
      ecfNumber: "B02hack",
      items: [{}],
      number: "PROF-hack",
    });
    expect(out).toEqual({
      customerName: "Willian",
      customerPhone: "809",
      customerDocument: null,
      notes: "nota",
    });
    expect("total" in out).toBe(false);
    expect("ecfNumber" in out).toBe(false);
    expect("items" in out).toBe(false);
  });

  it("no incluye customerName si queda vacío", () => {
    const out = pickEditableProformaFields({ customerName: "   " });
    expect("customerName" in out).toBe(false);
  });
});

describe("canEditSales", () => {
  it("ADMIN y manager pueden; cajero no", () => {
    expect(canEditSales("admin")).toBe(true);
    expect(canEditSales("super_admin")).toBe(true);
    expect(canEditSales("manager")).toBe(true);
    expect(canEditSales("cashier")).toBe(false);
    expect(canEditSales("auditor")).toBe(false);
  });
});
