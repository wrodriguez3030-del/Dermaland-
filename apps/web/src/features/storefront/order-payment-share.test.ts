import { describe, expect, it } from "vitest";
import {
  buildOrderPaymentWhatsappMessage,
  buildOrderPaymentWhatsappUrl,
} from "./order-payment-share";

describe("buildOrderPaymentWhatsappMessage", () => {
  it("saluda por su nombre, dice el pedido y deja el enlace solo en su línea", () => {
    const msg = buildOrderPaymentWhatsappMessage({
      contactName: "María Pérez",
      orderNumber: "WEB-000123",
      siteName: "DermaLand",
      url: "https://dermaland.vercel.app/tienda/pedido/abc",
    });
    expect(msg).toBe(
      [
        "Hola María Pérez, ya puedes pagar tu pedido WEB-000123 de DermaLand con tarjeta:",
        "",
        "https://dermaland.vercel.app/tienda/pedido/abc",
        "",
        "El enlace lleva el monto exacto de tu compra.",
      ].join("\n"),
    );
  });

  it("sin nombre saluda a secas", () => {
    const msg = buildOrderPaymentWhatsappMessage({
      contactName: "",
      orderNumber: "WEB-000123",
      siteName: "DermaLand",
      url: "https://x/y",
    });
    expect(msg.startsWith("Hola, ya puedes pagar tu pedido WEB-000123")).toBe(
      true,
    );
  });
});

describe("buildOrderPaymentWhatsappUrl", () => {
  it("normaliza el teléfono RD y codifica el mensaje", () => {
    const url = buildOrderPaymentWhatsappUrl({
      contactPhone: "809-555-1234",
      contactName: "Ana",
      orderNumber: "WEB-000001",
      siteName: "DermaLand",
      url: "https://x/y",
    });
    expect(url.startsWith("https://wa.me/18095551234?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("WEB-000001"));
  });

  it("sin teléfono usable, wa.me sin número (WhatsApp pide elegir contacto)", () => {
    const url = buildOrderPaymentWhatsappUrl({
      contactPhone: "12345",
      contactName: "Ana",
      orderNumber: "WEB-000001",
      siteName: "DermaLand",
      url: "https://x/y",
    });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });
});
