import { describe, it, expect } from "vitest";
import { buildInvoiceEmailHtml } from "./invoice-email-html";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { Proforma } from "@/types";

function makeProforma(over: Partial<Proforma> = {}): Proforma {
  const base = {
    id: "prof_1",
    businessId: mockBusiness.id,
    branchId: "br_santiago",
    number: "B0200001302",
    customerId: "cust_1",
    customerName: "María Fernanda",
    documentKind: "invoice",
    status: "paid",
    items: [],
    payments: [],
    subtotal: 1686.44,
    itbis: 303.56,
    discount: 0,
    total: 1990,
    createdAt: "2026-07-22T10:00:00Z",
  };
  return { ...base, ...over } as Proforma;
}

describe("buildInvoiceEmailHtml", () => {
  const opts = {
    viewUrl: "https://dermaland.vercel.app/factura/TOKEN",
    logoUrl: "https://dermaland.vercel.app/api/brand/logo",
  };

  it("incluye logo, cliente, total y el enlace público (botón)", () => {
    const html = buildInvoiceEmailHtml(makeProforma(), mockBusiness, opts);
    expect(html).toContain(opts.logoUrl);
    expect(html).toContain("María Fernanda");
    expect(html).toContain("RD$1,990.00");
    expect(html).toContain(opts.viewUrl);
    expect(html).toContain("Ver factura y descargar PDF");
    expect(html).toContain(mockBusiness.commercialName);
  });

  it("proforma incluye el aviso de no validez fiscal", () => {
    const html = buildInvoiceEmailHtml(
      makeProforma({ documentKind: "proforma", number: "PROF-1" }),
      mockBusiness,
      opts,
    );
    expect(html).toMatch(/no tiene validez fiscal/i);
  });

  it("escapa HTML del nombre del cliente (anti-inyección)", () => {
    const html = buildInvoiceEmailHtml(
      makeProforma({ customerName: "<script>x</script>" }),
      mockBusiness,
      opts,
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
