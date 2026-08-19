import { describe, expect, it } from "vitest";
import { normalizeAzulPaymentLink } from "./azul-link";

describe("normalizeAzulPaymentLink", () => {
  it("acepta el enlace del comercio y lo devuelve normalizado", () => {
    expect(normalizeAzulPaymentLink("https://pagos.azul.com.do/dcb1c70b")).toEqual(
      { ok: true, url: "https://pagos.azul.com.do/dcb1c70b" },
    );
  });

  it("acepta sin esquema y lo sube a https", () => {
    expect(normalizeAzulPaymentLink("pagos.azul.com.do/dcb1c70b")).toEqual({
      ok: true,
      url: "https://pagos.azul.com.do/dcb1c70b",
    });
  });

  it("vacío = sin enlace, no un error", () => {
    expect(normalizeAzulPaymentLink("  ")).toEqual({ ok: true, url: null });
  });

  it("recorta espacios alrededor de un enlace pegado", () => {
    expect(
      normalizeAzulPaymentLink("  https://pagos.azul.com.do/dcb1c70b  "),
    ).toEqual({ ok: true, url: "https://pagos.azul.com.do/dcb1c70b" });
  });

  it("rechaza otros dominios: un tipeo no puede mandar a pagar a otro sitio", () => {
    for (const malo of [
      "https://pagos.azul.com.do.evil.com/x",
      "https://azul.com.do/pagar",
      "https://www.pagos.azul.com.do/x",
      "http://pagos.azul.com.do/x",
      "javascript:alert(1)",
      "no es una url",
    ]) {
      expect(normalizeAzulPaymentLink(malo).ok, malo).toBe(false);
    }
  });
});
