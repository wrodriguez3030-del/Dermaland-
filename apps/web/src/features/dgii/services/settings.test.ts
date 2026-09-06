import { describe, it, expect } from "vitest";
import { estaConfigurado, modoFiscal } from "./settings";

const base = {
  businessId: "b1",
  rncEmisor: "131561985",
  razonSocialEmisor: "DERMALAND SRL",
  direccionEmisor: "Calle 1",
  provinciaCodigo: "25",
  municipioCodigo: "01",
  correoEmisor: "a@b.do",
  telefonoEmisor: "8095551234",
  ambiente: "testecf" as const,
  dgiiEnabledRealSend: false,
};

describe("configuración fiscal", () => {
  it("sin RNC no se emite: es el dato que identifica al emisor ante la DGII", () => {
    expect(estaConfigurado({ ...base, rncEmisor: null })).toBe(false);
    expect(estaConfigurado({ ...base, rncEmisor: "" })).toBe(false);
  });

  it("sin razón social ni dirección tampoco: los tres van dentro del XML firmado", () => {
    expect(estaConfigurado({ ...base, razonSocialEmisor: null })).toBe(false);
    expect(estaConfigurado({ ...base, direccionEmisor: null })).toBe(false);
  });

  it("con los datos mínimos, sí", () => {
    expect(estaConfigurado(base)).toBe(true);
  });

  it("el ambiente por defecto es el de pruebas, nunca el real", () => {
    // Un default que emita de verdad convierte un descuido en un comprobante fiscal.
    // El valor viene de una fila de la base; la BD y su CHECK pueden cambiar sin tocar este fichero.
    expect(modoFiscal({ ...base, ambiente: null as never })).toBe("testecf");
    expect(modoFiscal({ ...base, ambiente: undefined as never })).toBe("testecf");
    expect(modoFiscal({ ...base, ambiente: "produccion" as never })).toBe("testecf");
    expect(modoFiscal({ ...base, ambiente: " ecf " as never })).toBe("testecf");
    expect(modoFiscal({ ...base, ambiente: "ECF" as never })).toBe("testecf");
  });

  it("el ambiente real solo sale si está escrito explícitamente", () => {
    expect(modoFiscal({ ...base, ambiente: "ecf" })).toBe("ecf");
    expect(modoFiscal({ ...base, ambiente: "certecf" })).toBe("certecf");
  });
});
