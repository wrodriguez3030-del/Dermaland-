import { describe, expect, it } from "vitest";
import {
  digitCount,
  formatCedula,
  formatDominicanPhone,
  formatPassport,
  formatRnc,
  normalizeDocumentByType,
  onlyDigits,
  softValidateCedula,
  softValidatePhone,
  softValidateRnc,
} from "./formatters";

describe("onlyDigits", () => {
  it("descarta no-dígitos", () => {
    expect(onlyDigits("031-0234567-8")).toBe("03102345678");
    expect(onlyDigits("(809) 555-0000")).toBe("8095550000");
    expect(onlyDigits("")).toBe("");
  });
});

describe("formatCedula", () => {
  it("formatea cédula completa", () => {
    expect(formatCedula("03102345678")).toBe("031-0234567-8");
  });
  it("idempotente — re-aplicar no duplica guiones", () => {
    expect(formatCedula(formatCedula("03102345678"))).toBe("031-0234567-8");
  });
  it("limita a 11 dígitos", () => {
    expect(formatCedula("0310234567812345")).toBe("031-0234567-8");
  });
  it("formatea parcial mientras se escribe", () => {
    expect(formatCedula("031")).toBe("031");
    expect(formatCedula("0310")).toBe("031-0");
    expect(formatCedula("0310234567")).toBe("031-0234567");
  });
  it("limpia entrada con guiones existentes", () => {
    expect(formatCedula("031-0234-5678")).toBe("031-0234567-8");
  });
});

describe("formatRnc", () => {
  it("formatea RNC completo", () => {
    expect(formatRnc("101123456")).toBe("101-12345-6");
  });
  it("idempotente", () => {
    expect(formatRnc(formatRnc("101123456"))).toBe("101-12345-6");
  });
  it("limita a 9 dígitos", () => {
    expect(formatRnc("1011234567890")).toBe("101-12345-6");
  });
  it("limpia entrada con guiones existentes", () => {
    expect(formatRnc("101-12345-6")).toBe("101-12345-6");
  });
});

describe("formatDominicanPhone", () => {
  it("formatea local", () => {
    expect(formatDominicanPhone("8095550000")).toBe("809-555-0000");
  });
  it("formatea con +1 explícito", () => {
    expect(formatDominicanPhone("+18095550000")).toBe("+1 809-555-0000");
  });
  it("limpia paréntesis y espacios", () => {
    expect(formatDominicanPhone("(809) 555-0000")).toBe("809-555-0000");
  });
  it("idempotente", () => {
    expect(formatDominicanPhone(formatDominicanPhone("8095550000"))).toBe(
      "809-555-0000",
    );
  });
  it("detecta +1 implícito por largo 11 con prefijo 1", () => {
    expect(formatDominicanPhone("18095550000")).toBe("+1 809-555-0000");
  });
});

describe("formatPassport", () => {
  it("mayúsculas y trim", () => {
    expect(formatPassport(" ab123456 ")).toBe("AB123456");
  });
  it("limita a 20", () => {
    expect(formatPassport("ABC1234567890123456789EXTRA").length).toBe(20);
  });
  it("descarta caracteres no alfanuméricos", () => {
    expect(formatPassport("AB-123-456")).toBe("AB123456");
  });
});

describe("normalizeDocumentByType", () => {
  it("cambia formato al cambiar tipo sin duplicar guiones", () => {
    const cedula = "031-0234567-8";
    expect(normalizeDocumentByType(cedula, "rnc")).toBe("031-02345-6");
    expect(normalizeDocumentByType(cedula, "passport")).toBe("03102345678");
  });
});

describe("validación suave", () => {
  it("cédula: alerta si < 11 dígitos", () => {
    expect(softValidateCedula("031")).toMatch(/incompleta/i);
    expect(softValidateCedula("031-0234567-8")).toBeNull();
  });
  it("RNC: alerta si < 9 dígitos", () => {
    expect(softValidateRnc("101")).toMatch(/incompleto/i);
    expect(softValidateRnc("101-12345-6")).toBeNull();
  });
  it("teléfono: alerta si < 10 dígitos", () => {
    expect(softValidatePhone("80")).toMatch(/incompleto/i);
    expect(softValidatePhone("809-555-0000")).toBeNull();
    expect(softValidatePhone("+1 809-555-0000")).toBeNull();
  });
});

describe("digitCount", () => {
  it("cuenta solo dígitos", () => {
    expect(digitCount("031-0234567-8")).toBe(11);
    expect(digitCount("abc")).toBe(0);
  });
});
