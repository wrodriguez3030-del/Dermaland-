import { describe, it, expect } from "vitest";
import {
  buildWhatsappMessage,
  buildWhatsappShareUrl,
  isDemoDocument,
  proformaDocLabel,
} from "./proforma-share";
import type { Business, Proforma } from "@/types";

const business: Business = {
  id: "biz_dermaland",
  legalName: "DermaLand SRL",
  commercialName: "DermaLand",
  rnc: "1-32-59077-5",
  country: "República Dominicana",
  whatsapp: "+1 809-226-5252",
  instagramUrl: "https://www.instagram.com/dermalandrd",
  dgiiEnabled: false,
  planId: "plan_business",
  status: "active",
  createdAt: "2026-05-04T14:00:00Z",
  updatedAt: "2026-05-04T14:00:00Z",
};

function makeProforma(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "prof_test_1",
    number: "PROF-2026-00001",
    customerName: "María Pérez",
    customerPhone: "+1 809-555-0101",
    cashierId: "usr_1",
    cashierName: "Rosa Peralta",
    branchId: "br_santiago",
    items: [],
    subtotal: 1000,
    discount: 0,
    itbis: 180,
    total: 1180,
    status: "paid",
    payments: [],
    paid: 1180,
    balance: 0,
    createdAt: "2026-06-16T18:00:00Z",
    updatedAt: "2026-06-16T18:00:00Z",
    ...over,
  } as Proforma;
}

describe("proformaDocLabel", () => {
  it("proforma simple", () => {
    expect(proformaDocLabel(makeProforma())).toBe("Proforma");
  });
  it("factura de consumo e-CF 32", () => {
    expect(
      proformaDocLabel(makeProforma({ documentKind: "invoice", ecfType: "32" })),
    ).toContain("32");
  });
  it("factura de crédito fiscal e-CF 31", () => {
    expect(
      proformaDocLabel(makeProforma({ documentKind: "invoice", ecfType: "31" })),
    ).toContain("31");
  });
});

describe("isDemoDocument", () => {
  it("es DEMO mientras no esté convertido a e-CF", () => {
    expect(isDemoDocument(makeProforma({ status: "paid" }))).toBe(true);
    expect(isDemoDocument(makeProforma({ status: "issued" }))).toBe(true);
  });
  it("no es DEMO cuando ya es e-CF", () => {
    expect(isDemoDocument(makeProforma({ status: "converted_to_ecf" }))).toBe(
      false,
    );
  });
});

describe("buildWhatsappShareUrl", () => {
  it("genera un link wa.me válido con el teléfono del cliente (solo dígitos)", () => {
    const url = buildWhatsappShareUrl(makeProforma(), business);
    expect(url).toMatch(/^https:\/\/wa\.me\/18095550101\?text=/);
  });

  it("sin teléfono usa wa.me sin destinatario (sigue siendo válido)", () => {
    const url = buildWhatsappShareUrl(
      makeProforma({ customerPhone: undefined }),
      business,
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("NUNCA incluye una URL de la app que pueda dar 404", () => {
    const url = buildWhatsappShareUrl(makeProforma(), business);
    expect(url).not.toContain("/proformas/");
    expect(url).not.toContain("vercel.app");
  });

  it("el mensaje incluye negocio, número y total", () => {
    const msg = buildWhatsappMessage(makeProforma(), business);
    expect(msg).toContain("DermaLand");
    expect(msg).toContain("PROF-2026-00001");
    expect(msg).toContain("RNC 1-32-59077-5");
  });
});
