import { describe, expect, it } from "vitest";
import { isNewCustomer, NEW_CUSTOMER_WINDOW_DAYS } from "./customer-flags";

const now = new Date("2026-07-21T12:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("isNewCustomer", () => {
  it("marca como Nuevo dentro de la ventana de 7 días", () => {
    expect(isNewCustomer({ createdAt: daysAgo(0) }, now)).toBe(true);
    expect(isNewCustomer({ createdAt: daysAgo(3) }, now)).toBe(true);
    expect(isNewCustomer({ createdAt: daysAgo(6.9) }, now)).toBe(true);
  });

  it("deja de marcar al pasar la ventana", () => {
    expect(isNewCustomer({ createdAt: daysAgo(7.1) }, now)).toBe(false);
    expect(isNewCustomer({ createdAt: daysAgo(30) }, now)).toBe(false);
  });

  it("no marca fechas futuras ni inválidas", () => {
    expect(isNewCustomer({ createdAt: daysAgo(-1) }, now)).toBe(false);
    expect(isNewCustomer({ createdAt: "" }, now)).toBe(false);
    expect(isNewCustomer({ createdAt: "no-es-fecha" }, now)).toBe(false);
  });

  it("la ventana por defecto es de una semana", () => {
    expect(NEW_CUSTOMER_WINDOW_DAYS).toBe(7);
  });
});
