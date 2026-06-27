import { describe, expect, it } from "vitest";
import type { Customer } from "@/types";
import {
  CUSTOMER_REQUIRED_MESSAGE,
  customerChargeBlock,
  isRealCustomerSelected,
  isValidCustomerId,
} from "./checkout-guards";

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: "cust_real_1",
    businessId: "biz",
    customerNumber: "CLI-000001",
    firstName: "Willian",
    lastName: "Rodriguez",
    source: "manual",
    tags: [],
    defaultBillingType: "consumo",
    skinType: "not_specified",
    totalSpent: 0,
    totalOrders: 0,
    createdAt: "2026-06-27T00:00:00Z",
    updatedAt: "2026-06-27T00:00:00Z",
    ...over,
  } as Customer;
}

describe("isValidCustomerId", () => {
  it("acepta un id real", () => {
    expect(isValidCustomerId("cust_real_1")).toBe(true);
    expect(isValidCustomerId("3f1a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b")).toBe(true);
  });
  it("rechaza vacío / walk-in / null / undefined", () => {
    expect(isValidCustomerId("")).toBe(false);
    expect(isValidCustomerId("walk-in")).toBe(false);
    expect(isValidCustomerId("Walk-In")).toBe(false);
    expect(isValidCustomerId("consumidor final")).toBe(false);
    expect(isValidCustomerId(null)).toBe(false);
    expect(isValidCustomerId(undefined)).toBe(false);
  });
});

describe("isRealCustomerSelected", () => {
  it("true con cliente real", () => {
    expect(isRealCustomerSelected(customer())).toBe(true);
  });
  it("false con null/undefined (walk-in)", () => {
    expect(isRealCustomerSelected(null)).toBe(false);
    expect(isRealCustomerSelected(undefined)).toBe(false);
  });
  it("false si el id del cliente es inválido", () => {
    expect(isRealCustomerSelected(customer({ id: "walk-in" }))).toBe(false);
    expect(isRealCustomerSelected(customer({ id: "" }))).toBe(false);
  });
});

describe("customerChargeBlock", () => {
  it("bloquea con walk-in (null) y devuelve el mensaje exacto", () => {
    expect(customerChargeBlock(null)).toBe(CUSTOMER_REQUIRED_MESSAGE);
    expect(customerChargeBlock(null)).toBe(
      "Debes seleccionar o crear un cliente antes de facturar.",
    );
  });
  it("no bloquea con cliente real", () => {
    expect(customerChargeBlock(customer())).toBeNull();
  });
  it("el mensaje no contiene jerga técnica", () => {
    expect(CUSTOMER_REQUIRED_MESSAGE).not.toMatch(/uuid|supabase|null|customer_id/i);
  });
});
