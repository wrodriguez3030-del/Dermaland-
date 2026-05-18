// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  addCreditNote,
  getCreditNoteByInvoice,
  listCreditNotes,
  deleteCreditNote,
  generateCreditNoteId,
  type CreditNoteRecord,
} from "./credit-note-store";

function makeRecord(
  sourceInvoiceId: string,
  overrides: Partial<CreditNoteRecord> = {},
): CreditNoteRecord {
  return {
    id: generateCreditNoteId(),
    sourceInvoiceId,
    sourceEcfType: "31",
    sourceEcfNumber: "E310000000186",
    ncEncf: "E340000000001",
    motivo: "Anulación por error",
    codigoModificacion: 1,
    indicadorNotaCredito: 0,
    securityCode: "AbCd1234",
    qrUrl: "https://ecf.dgii.gov.do/testecf/x",
    mockTrackId: "MOCK-NC-x",
    createdAt: new Date().toISOString(),
    isMock: true,
    ...overrides,
  };
}

beforeEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});

describe("credit-note-store", () => {
  it("addCreditNote agrega un registro nuevo", () => {
    addCreditNote(makeRecord("ecf_001"));
    expect(listCreditNotes()).toHaveLength(1);
  });

  it("getCreditNoteByInvoice recupera por sourceInvoiceId", () => {
    addCreditNote(makeRecord("ecf_001"));
    const found = getCreditNoteByInvoice("ecf_001");
    expect(found?.sourceInvoiceId).toBe("ecf_001");
  });

  it("retorna undefined si no hay NC para la factura", () => {
    expect(getCreditNoteByInvoice("ecf_xxx")).toBeUndefined();
  });

  it("listCreditNotes ordena por fecha desc", () => {
    addCreditNote(
      makeRecord("ecf_001", { createdAt: "2026-01-01T00:00:00Z" }),
    );
    addCreditNote(
      makeRecord("ecf_002", { createdAt: "2026-05-17T00:00:00Z" }),
    );
    const all = listCreditNotes();
    expect(all[0]?.sourceInvoiceId).toBe("ecf_002");
    expect(all[1]?.sourceInvoiceId).toBe("ecf_001");
  });

  it("deleteCreditNote elimina por id", () => {
    const r = makeRecord("ecf_001");
    addCreditNote(r);
    deleteCreditNote(r.id);
    expect(listCreditNotes()).toHaveLength(0);
  });

  it("generateCreditNoteId produce ids únicos", () => {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(generateCreditNoteId());
    expect(set.size).toBe(100);
  });

  it("todas las NC se marcan isMock = true", () => {
    addCreditNote(makeRecord("ecf_001"));
    expect(listCreditNotes()[0]?.isMock).toBe(true);
  });
});
