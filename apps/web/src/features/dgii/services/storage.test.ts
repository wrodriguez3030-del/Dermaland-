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
