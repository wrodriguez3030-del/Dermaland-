import { describe, it, expect, beforeAll } from "vitest";
import {
  mapMockInvoiceToEcfInput,
  renderEcfFromMock,
  DgiiDemoRendererError,
} from "./demo-renderer";
import { _resetDgiiDemoCertForTests } from "./demo-cert";
import { verifyEcfSignature } from "./signer";
import { getDgiiDemoKeyPair } from "./demo-cert";
import type { ElectronicInvoice } from "@/types";

const baseInvoice: ElectronicInvoice = {
  id: "ecf_test",
  ecfType: "31",
  ecfNumber: "E310000000186",
  customerName: "Distrimedica SRL",
  amount: 9609.32,
  itbis: 1730.68,
  total: 11340,
  status: "accepted",
  trackId: "DGII-TRK-2026-0000186",
  createdAt: "2026-05-04T18:30:00Z",
  submittedAt: "2026-05-04T18:32:11Z",
};

beforeAll(() => {
  _resetDgiiDemoCertForTests();
});

describe("mapMockInvoiceToEcfInput", () => {
  it("mapea invoice 31 con RNC del comprador y un item agregado", () => {
    const input = mapMockInvoiceToEcfInput(baseInvoice);
    expect(input.tipoEcf).toBe("31");
    expect(input.eNcf).toBe("E310000000186");
    expect(input.comprador.rncComprador).toBe("131234567");
    expect(input.comprador.razonSocialComprador).toBe("Distrimedica SRL");
    expect(input.items).toHaveLength(1);
    expect(input.items[0]?.montoItem).toBe(9609.32);
    expect(input.totales.montoTotal).toBe(11340);
  });

  it("mapea invoice 32 (Consumo) sin RNC del comprador", () => {
    const input = mapMockInvoiceToEcfInput({
      ...baseInvoice,
      ecfType: "32",
      customerName: "Walk-in",
    });
    expect(input.tipoEcf).toBe("32");
    expect(input.comprador.rncComprador).toBeUndefined();
    expect(input.comprador.razonSocialComprador).toBe("Walk-in");
  });

  it("e-CF 32 con customerName vacío → 'Consumidor Final'", () => {
    const input = mapMockInvoiceToEcfInput({
      ...baseInvoice,
      ecfType: "32",
      customerName: "",
    });
    expect(input.comprador.razonSocialComprador).toBe("Consumidor Final");
  });

  it("e-CF 34 (NC) genera informacionReferencia con codigoModificacion=1", () => {
    const input = mapMockInvoiceToEcfInput({
      ...baseInvoice,
      ecfType: "34",
      ecfNumber: "E340000000010",
    });
    expect(input.informacionReferencia?.codigoModificacion).toBe(1);
  });

  it("e-CF 33 (ND) genera informacionReferencia con codigoModificacion=2", () => {
    const input = mapMockInvoiceToEcfInput({
      ...baseInvoice,
      ecfType: "33",
      ecfNumber: "E330000000005",
    });
    expect(input.informacionReferencia?.codigoModificacion).toBe(2);
  });

  it("rechaza tipos 41+", () => {
    expect(() =>
      mapMockInvoiceToEcfInput({ ...baseInvoice, ecfType: "41" }),
    ).toThrow(DgiiDemoRendererError);
  });
});

describe("renderEcfFromMock — pipeline completo offline", () => {
  it("genera unsignedXml, signedXml, pdfBuffer, securityCode, qrUrl y warning", async () => {
    const r = await renderEcfFromMock(baseInvoice);
    expect(r.unsignedXml).toContain("<ECF>");
    expect(r.unsignedXml).not.toContain("<Signature");
    expect(r.signedXml).toContain("<Signature");
    expect(r.pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(r.securityCode).toMatch(/^[a-zA-Z0-9]{8}$/);
    expect(r.qrUrl).toContain("ecf.dgii.gov.do");
    expect(r.qrUrl).toContain(r.securityCode);
    expect(r.warning).toContain("DEMOSTRACIÓN");
  });

  it("la firma roundtrip-verifica con el cert demo", async () => {
    const { signedXml } = await renderEcfFromMock(baseInvoice);
    const { certificatePem } = getDgiiDemoKeyPair();
    expect(verifyEcfSignature(signedXml, certificatePem)).toBe(true);
  });

  it("el cert demo es el mismo entre llamadas (cacheado)", async () => {
    const a = getDgiiDemoKeyPair();
    const b = getDgiiDemoKeyPair();
    expect(a.certificatePem).toBe(b.certificatePem);
    expect(a.privateKeyPem).toBe(b.privateKeyPem);
  });

  it("e-CF 32 (consumidor final) también produce PDF válido", async () => {
    const r = await renderEcfFromMock({
      ...baseInvoice,
      ecfType: "32",
      customerName: "",
      ecfNumber: "E320000004890",
    });
    expect(r.pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    // El XML firmado no debería incluir RNCComprador (consumidor final).
    expect(r.signedXml).not.toContain("<RNCComprador>");
  });
});
