import { describe, expect, it } from "vitest";
import { canSetAzulLink, normalizeAzulPaymentLink } from "./azul-link";

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

describe("canSetAzulLink", () => {
  const base = {
    paymentMethod: "tarjeta",
    paymentStatus: "pendiente",
    status: "recibido",
  } as const;

  it("un pedido de tarjeta, sin pagar y vivo, admite enlace", () => {
    expect(canSetAzulLink(base)).toEqual({ ok: true });
    expect(canSetAzulLink({ ...base, status: "preparando" })).toEqual({
      ok: true,
    });
  });

  it("efectivo o transferencia no llevan enlace de Azul", () => {
    expect(canSetAzulLink({ ...base, paymentMethod: "efectivo" })).toEqual({
      ok: false,
      error: "Este pedido no se paga con tarjeta.",
    });
    expect(
      canSetAzulLink({ ...base, paymentMethod: "transferencia" }),
    ).toEqual({ ok: false, error: "Este pedido no se paga con tarjeta." });
  });

  it("pagado o reembolsado ya no se cobra", () => {
    expect(canSetAzulLink({ ...base, paymentStatus: "pagado" })).toEqual({
      ok: false,
      error: "Este pedido ya está pagado.",
    });
    expect(canSetAzulLink({ ...base, paymentStatus: "reembolsado" })).toEqual({
      ok: false,
      error: "Este pedido fue reembolsado.",
    });
  });

  it("cancelado no se cobra", () => {
    expect(canSetAzulLink({ ...base, status: "cancelado" })).toEqual({
      ok: false,
      error: "Este pedido está cancelado.",
    });
  });
});
