import { describe, it, expect } from "vitest";
import {
  computeIndicadorNotaCredito,
  mapSourceInvoiceToNcInput,
  VALID_CODIGOS_MODIFICACION,
} from "./source-invoice-to-nc";
import { buildEcfXml } from "./builder";
import type { ElectronicInvoice } from "@/types";

const baseInvoice: ElectronicInvoice = {
  id: "ecf_origen",
  ecfType: "31",
  ecfNumber: "E310000000186",
  customerName: "Distrimedica SRL",
  amount: 9610.17,
  itbis: 1729.83,
  total: 11340,
  status: "accepted",
  trackId: "DGII-TRK-2026-0000186",
  createdAt: "2026-05-04T18:30:00Z",
  submittedAt: "2026-05-04T18:32:11Z",
};

describe("computeIndicadorNotaCredito", () => {
  it("dentro de 30 días → 0", () => {
    const source = new Date("2026-05-01");
    const nc = new Date("2026-05-15"); // 14 días
    expect(computeIndicadorNotaCredito(source, nc)).toBe(0);
  });

  it("exactamente 30 días → 0", () => {
    const source = new Date("2026-05-01");
    const nc = new Date("2026-05-31"); // 30 días
    expect(computeIndicadorNotaCredito(source, nc)).toBe(0);
  });

  it("31 días → 1", () => {
    const source = new Date("2026-05-01");
    const nc = new Date("2026-06-01"); // 31 días
    expect(computeIndicadorNotaCredito(source, nc)).toBe(1);
  });

  it("muchos meses después → 1", () => {
    const source = new Date("2026-01-01");
    const nc = new Date("2026-08-01");
    expect(computeIndicadorNotaCredito(source, nc)).toBe(1);
  });
});

describe("mapSourceInvoiceToNcInput — mapeo básico", () => {
  it("produce tipoEcf=34 y eNcf con prefijo E34 + 10 dígitos", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "Devolución de mercancía dañada",
      codigoModificacion: 3,
      now: new Date("2026-05-10T10:00:00Z"),
    });
    expect(input.tipoEcf).toBe("34");
    expect(input.eNcf).toMatch(/^E34\d{10}$/);
  });

  it("informacionReferencia apunta a la factura origen", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
    });
    expect(input.informacionReferencia?.ncfModificado).toBe(
      baseInvoice.ecfNumber,
    );
    expect(input.informacionReferencia?.codigoModificacion).toBe(1);
  });

  it("indicadorNotaCredito = 0 cuando NC se emite a 14 días del origen", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
      now: new Date("2026-05-18T10:00:00Z"),
    });
    expect(input.indicadorNotaCredito).toBe(0);
  });

  it("indicadorNotaCredito = 1 cuando NC > 30 días después", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
      now: new Date("2026-08-01T10:00:00Z"),
    });
    expect(input.indicadorNotaCredito).toBe(1);
  });

  it("motivo va en descripcionItem del item único", () => {
    const motivo = "Cliente devolvió el producto sin abrir";
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo,
      codigoModificacion: 3,
    });
    expect(input.items[0]?.descripcionItem).toBe(motivo);
  });

  it("usa rncComprador del caller si se pasa, sino fallback demo", () => {
    const conRnc = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
      rncComprador: "987654321",
    });
    const sinRnc = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
    });
    expect(conRnc.comprador.rncComprador).toBe("987654321");
    expect(sinRnc.comprador.rncComprador).toBe("131234567");
  });

  it("totales reflejan el monto de la factura origen", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "x",
      codigoModificacion: 1,
    });
    expect(input.totales.montoTotal).toBe(baseInvoice.total);
    expect(input.totales.totalItbis).toBe(baseInvoice.itbis);
    expect(input.totales.montoGravadoTotal).toBe(baseInvoice.amount);
  });
});

describe("mapSourceInvoiceToNcInput — validaciones", () => {
  it("rechaza motivo vacío", () => {
    expect(() =>
      mapSourceInvoiceToNcInput({
        sourceInvoice: baseInvoice,
        motivo: "",
        codigoModificacion: 1,
      }),
    ).toThrow(/motivo/i);
  });

  it("rechaza motivo de puro whitespace", () => {
    expect(() =>
      mapSourceInvoiceToNcInput({
        sourceInvoice: baseInvoice,
        motivo: "   ",
        codigoModificacion: 1,
      }),
    ).toThrow(/motivo/i);
  });

  it("rechaza codigoModificacion fuera de 1..5", () => {
    expect(() =>
      mapSourceInvoiceToNcInput({
        sourceInvoice: baseInvoice,
        motivo: "x",
        codigoModificacion: 99 as never,
      }),
    ).toThrow(/codigoModificacion/);
  });

  it("acepta los 5 códigos válidos", () => {
    for (const cod of VALID_CODIGOS_MODIFICACION) {
      const input = mapSourceInvoiceToNcInput({
        sourceInvoice: baseInvoice,
        motivo: "x",
        codigoModificacion: cod,
      });
      expect(input.informacionReferencia?.codigoModificacion).toBe(cod);
    }
  });
});

describe("mapSourceInvoiceToNcInput — pipeline integration", () => {
  it("el output pasa el builder de e-CF 34 (validación estructural)", () => {
    const input = mapSourceInvoiceToNcInput({
      sourceInvoice: baseInvoice,
      motivo: "Anulación por error de captura",
      codigoModificacion: 1,
    });
    const xml = buildEcfXml(input);
    expect(xml).toContain("<TipoeCF>34</TipoeCF>");
    expect(xml).toContain("<IndicadorNotaCredito>");
    expect(xml).not.toContain("<FechaVencimientoSecuencia>");
    expect(xml).toContain("<InformacionReferencia>");
    expect(xml).toContain("<NCFModificado>E310000000186</NCFModificado>");
    expect(xml).toContain("<CodigoModificacion>1</CodigoModificacion>");
  });
});
