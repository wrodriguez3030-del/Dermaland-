import { describe, it, expect } from "vitest";
import {
  buildWhatsappMessage,
  buildWhatsappShareMessage,
  buildWhatsappShareUrl,
  isDemoDocument,
  normalizeWhatsappPhone,
  proformaDocLabel,
  whatsappPdfFilename,
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

describe("normalizeWhatsappPhone", () => {
  it("antepone 1 a un número RD de 10 dígitos", () => {
    expect(normalizeWhatsappPhone("809-555-0101")).toBe("18095550101");
  });
  it("respeta 1 + 10 dígitos", () => {
    expect(normalizeWhatsappPhone("+1 809-555-0101")).toBe("18095550101");
  });
  it("devuelve null si no hay número usable", () => {
    expect(normalizeWhatsappPhone("")).toBeNull();
    expect(normalizeWhatsappPhone(undefined)).toBeNull();
    expect(normalizeWhatsappPhone("123")).toBeNull();
  });
});

describe("buildWhatsappShareUrl", () => {
  it("genera un link wa.me válido con el teléfono del cliente normalizado", () => {
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

  it("incluye el enlace al PDF cuando se provee", () => {
    const pdfUrl = "https://dermaland.vercel.app/api/proformas/prof_test_1/pdf?t=abc";
    const url = buildWhatsappShareUrl(makeProforma(), business, { pdfUrl });
    expect(decodeURIComponent(url)).toContain(pdfUrl);
  });
});

describe("buildWhatsappShareMessage", () => {
  it("factura NCF: dice que comparte la factura en PDF + link", () => {
    const msg = buildWhatsappShareMessage(
      makeProforma({ documentKind: "invoice", ecfType: undefined, number: "B0200000123" }),
      business,
      { pdfUrl: "https://x/pdf" },
    );
    expect(msg).toContain("Le compartimos su factura en PDF");
    expect(msg).toContain("Descargar factura:");
    expect(msg).toContain("https://x/pdf");
    expect(msg).toContain("DermaLand");
    // Una factura NCF NUNCA debe mencionar e-CF / e-NCF / representación e-CF.
    expect(msg).not.toContain("e-CF");
    expect(msg).not.toContain("e-NCF");
    expect(msg).not.toContain("representación");
  });

  it("proforma: aclara que no tiene validez fiscal", () => {
    const msg = buildWhatsappShareMessage(makeProforma(), business, {
      pdfUrl: "https://x/pdf",
    });
    expect(msg).toContain("proforma");
    expect(msg).toContain("no tiene validez fiscal");
    expect(msg).toContain("Descargar proforma:");
  });

  it("e-CF demo: incluye la nota de ambiente demo/no fiscal", () => {
    const msg = buildWhatsappShareMessage(
      makeProforma({ documentKind: "invoice", ecfType: "32", ecfNumber: "E320000001" }),
      business,
      { pdfUrl: "https://x/pdf" },
    );
    expect(msg).toContain("comprobante electrónico");
    expect(msg).toContain("representación impresa");
    expect(msg).toContain("demo/no fiscal");
    expect(msg).toContain("E320000001");
  });

  it("el mensaje base incluye negocio, número y total", () => {
    const msg = buildWhatsappMessage(makeProforma(), business);
    expect(msg).toContain("DermaLand");
    expect(msg).toContain("PROF-2026-00001");
  });
});

describe("whatsappPdfFilename", () => {
  it("proforma → Proforma-<numero>.pdf", () => {
    expect(whatsappPdfFilename(makeProforma())).toBe("Proforma-PROF-2026-00001.pdf");
  });
  it("factura → Factura-<comprobante>.pdf", () => {
    expect(
      whatsappPdfFilename(
        makeProforma({ documentKind: "invoice", ecfNumber: "B0200000123" }),
      ),
    ).toBe("Factura-B0200000123.pdf");
  });
});
