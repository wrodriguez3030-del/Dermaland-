import { describe, it, expect } from "vitest";
import { construirRuta, ErrorAlmacenamientoDgii, BUCKET_DGII, MAX_BYTES } from "./storage";

const ctx = { businessId: "00000000-0000-0000-0000-00000000d001" };

describe("almacenamiento privado de XML fiscales", () => {
  it("el path canónico es el mismo que el de agendapp: por negocio, por comprobante", () => {
    // Que sea idéntico importa: si algún día hay que auditar los dos sistemas,
    // los documentos están en el mismo sitio relativo.
    expect(construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/signed.xml");
    expect(construirRuta(ctx, { tipo: "rfce_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/rfce.xml");
  });

  it("un id con barras o puntos suspensivos NO puede salirse de su carpeta", () => {
    // Sin esto, un id manipulado escribiría sobre el comprobante de otra empresa.
    for (const malo of ["../otro", "a/b", "..", "a\\b", ""]) {
      expect(() => construirRuta(ctx, { tipo: "signed_xml", invoiceId: malo }), malo)
        .toThrow(ErrorAlmacenamientoDgii);
    }
  });

  it("un UUID con guiones SÍ pasa (válidos en identificadores)", () => {
    // Los UUIDs contienen guiones: 00000000-0000-0000-0000-00000000d001
    // Deben ser aceptados sin problema.
    expect(construirRuta(ctx, { tipo: "signed_xml", invoiceId: "550e8400-e29b-41d4-a716-446655440000" }))
      .toMatch(/550e8400-e29b-41d4-a716-446655440000/);
  });

  it("un id con caracteres de control (\\n, \\0, \\t) NO pasa", () => {
    // Los caracteres de control (0x00–0x1f) son peligrosos en filenames y auditoría.
    // Deben rechazarse incluso si el resto del id es válido.
    for (const malo of ["f-1\n", "f-1\0", "f-1\t"]) {
      expect(() => construirRuta(ctx, { tipo: "signed_xml", invoiceId: malo }))
        .toThrow(ErrorAlmacenamientoDgii);
    }
  });

  it("el businessId también se valida, aunque venga del servidor", () => {
    expect(() => construirRuta({ businessId: "../x" }, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toThrow(ErrorAlmacenamientoDgii);
  });

  it("el bucket es el privado de DermaLand, no el de agendapp", () => {
    expect(BUCKET_DGII).toBe("dgii-xml");
  });

  it("el tope de tamaño es el mismo que el de agendapp", () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("el error dice qué pasó, para poder distinguirlo arriba", () => {
    try {
      construirRuta(ctx, { tipo: "signed_xml", invoiceId: "../x" });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("path_invalid");
    }
  });
});
