import { describe, it, expect } from "vitest";
import {
  requiresLast4,
  allowsReference,
  validateLast4,
  validateDraftPayment,
  buildPayment,
  canFinalizeCheckout,
  checkoutHasUnresolvedLast4,
  paymentsSummary,
  primaryPaymentMethod,
  sanitizeLast4,
  type BuiltPayment,
} from "./payment-validation";

describe("requiresLast4 / allowsReference (qué campo muestra el modal)", () => {
  it("1. Tarjeta requiere últimos 4", () => {
    expect(requiresLast4("card")).toBe(true);
  });
  it("2. Transferencia requiere últimos 4", () => {
    expect(requiresLast4("transfer")).toBe(true);
  });
  it("3. Efectivo NO requiere últimos 4", () => {
    expect(requiresLast4("cash")).toBe(false);
    expect(allowsReference("cash")).toBe(false);
  });
  it("4. Otro método NO requiere últimos 4 pero admite referencia opcional", () => {
    expect(requiresLast4("other")).toBe(false);
    expect(allowsReference("other")).toBe(true);
  });
});

describe("validateLast4 (5,6,7 + mensajes de validación)", () => {
  it("5. Tarjeta exige exactamente 4 dígitos", () => {
    expect(validateLast4("1234", "card").ok).toBe(true);
    expect(validateLast4("123", "card")).toEqual({
      ok: false,
      error: "Debe tener exactamente 4 dígitos.",
    });
  });
  it("6. Transferencia exige exactamente 4 dígitos", () => {
    expect(validateLast4("9876", "transfer").ok).toBe(true);
    expect(validateLast4("98", "transfer")).toEqual({
      ok: false,
      error: "Debe tener exactamente 4 dígitos.",
    });
  });
  it("7. No acepta letras", () => {
    expect(validateLast4("12a4", "card")).toEqual({
      ok: false,
      error: "Solo se permiten números.",
    });
    expect(validateLast4("abcd", "transfer").error).toBe(
      "Solo se permiten números.",
    );
  });
  it("falta de últimos 4 da el mensaje de obligatorio", () => {
    expect(validateLast4("", "card")).toEqual({
      ok: false,
      error: "Debes ingresar los últimos 4 números.",
    });
  });
  it("efectivo y otro método nunca fallan por últimos 4", () => {
    expect(validateLast4("", "cash").ok).toBe(true);
    expect(validateLast4("", "other").ok).toBe(true);
  });
});

describe("validateDraftPayment", () => {
  it("exige monto mayor a 0", () => {
    expect(validateDraftPayment({ method: "cash", amount: 0 }).ok).toBe(false);
    expect(validateDraftPayment({ method: "cash", amount: 200 }).ok).toBe(true);
  });
  it("10. tarjeta sin últimos 4 no es un pago válido", () => {
    expect(
      validateDraftPayment({ method: "card", amount: 1000 }).ok,
    ).toBe(false);
    expect(
      validateDraftPayment({ method: "card", amount: 1000, last4: "1234" }).ok,
    ).toBe(true);
  });
});

describe("buildPayment (9. nunca guarda el número completo)", () => {
  it("9. tarjeta: solo guarda los últimos 4, descarta el resto del PAN", () => {
    const built = buildPayment({
      method: "card",
      amount: 1000,
      // El cajero podría pegar el número completo: solo deben quedar 4 dígitos.
      last4: "4111111111111234",
    });
    expect(built.last4).toBe("1234");
    expect(built).not.toHaveProperty("pan");
    expect(built).not.toHaveProperty("cvv");
    expect(JSON.stringify(built)).not.toContain("4111111111111234");
  });
  it("efectivo no lleva last4 ni reference", () => {
    const built = buildPayment({ method: "cash", amount: 200 });
    expect(built.last4).toBeUndefined();
    expect(built.reference).toBeUndefined();
  });
  it("otro método guarda referencia de texto corta", () => {
    const built = buildPayment({
      method: "other",
      amount: 500,
      reference: "Crédito interno #42",
    });
    expect(built.reference).toBe("Crédito interno #42");
    expect(built.last4).toBeUndefined();
  });
});

describe("8. múltiples pagos con diferentes últimos 4", () => {
  it("cada pago conserva su propio método, monto y referencia/últimos 4", () => {
    const payments: BuiltPayment[] = [
      buildPayment({ method: "card", amount: 1000, last4: "1234" }),
      buildPayment({ method: "transfer", amount: 500, last4: "9876" }),
      buildPayment({ method: "cash", amount: 200 }),
    ];
    expect(payments).toEqual([
      { method: "card", amount: 1000, last4: "1234" },
      { method: "transfer", amount: 500, last4: "9876" },
      { method: "cash", amount: 200 },
    ]);
    const summary = paymentsSummary(payments, 1700);
    expect(summary.paid).toBe(1700);
    expect(summary.balance).toBe(0);
    expect(summary.settled).toBe(true);
    expect(canFinalizeCheckout(payments)).toBe(true);
  });
});

describe("canFinalizeCheckout (10. bloqueo por últimos 4 faltantes)", () => {
  it("10. no se completa si un pago de tarjeta no tiene últimos 4", () => {
    const payments: BuiltPayment[] = [{ method: "card", amount: 1000 }];
    expect(checkoutHasUnresolvedLast4(payments)).toBe(true);
    expect(canFinalizeCheckout(payments)).toBe(false);
  });
  it("no se completa si un pago de transferencia tiene últimos 4 inválidos", () => {
    const payments: BuiltPayment[] = [
      { method: "transfer", amount: 500, last4: "98" },
    ];
    expect(canFinalizeCheckout(payments)).toBe(false);
  });
  it("sin pagos no se puede completar", () => {
    expect(canFinalizeCheckout([])).toBe(false);
  });
  it("efectivo solo se completa con monto", () => {
    expect(canFinalizeCheckout([{ method: "cash", amount: 200 }])).toBe(true);
  });
});

describe("paymentsSummary", () => {
  it("calcula cambio cuando se paga de más en efectivo", () => {
    const s = paymentsSummary([{ method: "cash", amount: 1000 }], 850);
    expect(s.change).toBe(150);
    expect(s.balance).toBe(0);
    expect(s.settled).toBe(true);
  });
  it("calcula saldo pendiente cuando falta", () => {
    const s = paymentsSummary([{ method: "cash", amount: 500 }], 850);
    expect(s.balance).toBe(350);
    expect(s.change).toBe(0);
    expect(s.settled).toBe(false);
  });
});

describe("primaryPaymentMethod (documento a emitir en pago dividido)", () => {
  it("prioriza tarjeta para disparar factura de consumo", () => {
    const payments: BuiltPayment[] = [
      { method: "cash", amount: 200 },
      { method: "card", amount: 1000, last4: "1234" },
    ];
    expect(primaryPaymentMethod(payments)).toBe("card");
  });
  it("sin tarjeta gana el pago de mayor monto", () => {
    const payments: BuiltPayment[] = [
      { method: "cash", amount: 200 },
      { method: "transfer", amount: 500, last4: "9876" },
    ];
    expect(primaryPaymentMethod(payments)).toBe("transfer");
  });
  it("sin pagos devuelve null", () => {
    expect(primaryPaymentMethod([])).toBeNull();
  });
});

describe("sanitizeLast4", () => {
  it("deja solo dígitos y conserva los últimos 4", () => {
    expect(sanitizeLast4("12-34")).toBe("1234");
    expect(sanitizeLast4("4111 1111 1111 1234")).toBe("1234");
    expect(sanitizeLast4("ab12")).toBe("12");
  });
});
