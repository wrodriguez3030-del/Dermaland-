// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Proforma } from "@/types";
import { Receipt80mm } from "./receipt-80mm";

afterEach(cleanup);

function make(over: Partial<Proforma> = {}): Proforma {
  return {
    id: "p1",
    number: "PROF-2026-00001",
    customerName: "María Pérez",
    cashierId: "u1",
    cashierName: "Rosa",
    branchId: "b1",
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

function text(p: Proforma): string {
  const { container } = render(<Receipt80mm proforma={p} />);
  return container.textContent ?? "";
}

describe("Receipt80mm — factura NCF tradicional (B02)", () => {
  const t = () =>
    text(make({ documentKind: "invoice", ecfNumber: "B0200001244" }));

  it("muestra el NCF", () => {
    expect(t()).toContain("NCF: B0200001244");
  });
  it("NO muestra e-NCF", () => {
    expect(t()).not.toContain("e-NCF");
  });
  it("NO muestra datos e-CF (validación DGII / código seguridad / fecha firma)", () => {
    const out = t();
    expect(out).not.toContain("ecf.dgii.gov.do");
    expect(out).not.toContain("Código seguridad");
    expect(out).not.toContain("Fecha firma");
    expect(out).not.toContain("Envío Diferido");
    expect(out).not.toContain("convertido a e-CF");
  });
  it("muestra la nota de ambiente demo (sin mencionar e-CF)", () => {
    expect(t()).toContain("ambiente demo");
  });
});

describe("Receipt80mm — factura NCF tradicional (B01)", () => {
  it("muestra el NCF B01 y no datos e-CF", () => {
    const out = text(
      make({
        documentKind: "invoice",
        ecfNumber: "B0100000320",
        sequenceType: "credito_fiscal",
      }),
    );
    expect(out).toContain("NCF: B0100000320");
    expect(out).not.toContain("e-NCF");
    expect(out).not.toContain("ecf.dgii.gov.do");
  });
});

describe("Receipt80mm — factura electrónica e-CF (E32)", () => {
  it("SÍ muestra e-NCF y datos e-CF", () => {
    const out = text(
      make({ documentKind: "invoice", ecfType: "32", ecfNumber: "E320000001" }),
    );
    expect(out).toContain("e-NCF: E320000001");
    expect(out).toContain("ecf.dgii.gov.do");
    expect(out).toContain("Código seguridad");
  });
});

describe("Receipt80mm — proforma", () => {
  it("NO muestra NCF ni e-CF", () => {
    const out = text(make({ documentKind: "proforma" }));
    expect(out).not.toContain("NCF:");
    expect(out).not.toContain("e-NCF");
    expect(out).not.toContain("ecf.dgii.gov.do");
    expect(out).toContain("No. PROF-2026-00001");
  });
});
