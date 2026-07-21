/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STORAGE_KEY,
  clearLocalCustomers,
  createCustomer,
  getCustomerByIdFromStore,
  listAllCustomers,
  preferredSendPhone,
} from "./customer-store";
import { mockBusiness } from "@/lib/mock-data/tenancy";

describe("customer-store (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    clearLocalCustomers();
  });

  it("preferredSendPhone prefiere WhatsApp sobre teléfono", () => {
    // El número de envío de factura debe ser el WhatsApp vigente, no el teléfono.
    expect(
      preferredSendPhone({ phone: "809-111-1111", whatsapp: "829-222-2222" }),
    ).toBe("829-222-2222");
    // Sin WhatsApp cae al teléfono.
    expect(
      preferredSendPhone({ phone: "809-111-1111", whatsapp: undefined }),
    ).toBe("809-111-1111");
    // Sin ninguno devuelve null (el caller decide el respaldo).
    expect(preferredSendPhone({ phone: undefined, whatsapp: undefined })).toBe(
      null,
    );
    // Ignora cadenas en blanco.
    expect(preferredSendPhone({ phone: "809-111-1111", whatsapp: "  " })).toBe(
      "809-111-1111",
    );
  });

  it("listAllCustomers incluye seed mock", () => {
    const all = listAllCustomers();
    expect(all.length).toBeGreaterThan(0);
    expect(all.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("createCustomer rechaza si faltan campos requeridos", () => {
    const r = createCustomer({
      firstName: "",
      lastName: "",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingFields).toContain("firstName");
      expect(r.missingFields).toContain("lastName");
    }
  });

  it("createCustomer rechaza si no hay teléfono ni WhatsApp", () => {
    const r = createCustomer({
      firstName: "Pedro",
      lastName: "Pérez",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingFields).toContain("phoneOrWhatsapp");
    }
  });

  it("createCustomer detecta duplicado por documento existente en seed", () => {
    const r = createCustomer({
      firstName: "Otro",
      lastName: "Nombre",
      phone: "+1 829-999-0000",
      documentNumber: "031-0234567-8", // mismo de cust_001
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.duplicate?.isDuplicate).toBe(true);
    }
  });

  it("createCustomer guarda cliente nuevo y aparece en listAll", () => {
    const r = createCustomer({
      firstName: "Pedro",
      lastName: "Pérez",
      phone: "+1 829-999-0000",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const all = listAllCustomers();
      expect(all.find((c) => c.id === r.customer.id)).toBeTruthy();
      expect(getCustomerByIdFromStore(r.customer.id)).toBeTruthy();
      expect(r.customer.customerNumber).toMatch(/^CLI-\d{6}$/);
    }
  });

  it("createCustomer persiste en localStorage", () => {
    createCustomer({
      firstName: "Test",
      lastName: "Persist",
      phone: "+1 809-111-2222",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].firstName).toBe("Test");
  });

  it("createCustomer con force:true bypassea duplicados", () => {
    const r = createCustomer(
      {
        firstName: "Otro",
        lastName: "Nombre",
        phone: "+1 829-999-0000",
        documentNumber: "031-0234567-8",
        defaultBillingType: "consumo",
        skinType: "not_specified",
      },
      { force: true },
    );
    expect(r.ok).toBe(true);
  });

  it("createCustomer asigna businessId del business actual por defecto", () => {
    const r = createCustomer({
      firstName: "Test",
      lastName: "Tenant",
      phone: "+1 809-333-4444",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.customer.businessId).toBe(mockBusiness.id);
    }
  });

  it("clearLocalCustomers vacía persistencia", () => {
    createCustomer({
      firstName: "Tmp",
      lastName: "X",
      phone: "+1 809-555-7777",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    expect(listAllCustomers().some((c) => c.firstName === "Tmp")).toBe(true);
    clearLocalCustomers();
    expect(listAllCustomers().some((c) => c.firstName === "Tmp")).toBe(false);
  });
});

describe("deleteCustomer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("elimina un cliente local creado por UI", async () => {
    const { deleteCustomer } = await import("./customer-store");
    const r = createCustomer({
      firstName: "ToDelete",
      lastName: "Now",
      phone: "+1 809-000-1111",
      defaultBillingType: "consumo",
      skinType: "not_specified",
    });
    if (!r.ok) throw new Error("create failed");
    const id = r.customer.id;
    expect(listAllCustomers().some((c) => c.id === id)).toBe(true);

    deleteCustomer(id);
    expect(listAllCustomers().some((c) => c.id === id)).toBe(false);
  });

  it("soft-delete oculta un cliente seed", async () => {
    const { deleteCustomer, isSoftDeleted } = await import("./customer-store");
    const all = listAllCustomers();
    const seed = all.find((c) => c.id === "cust_001")!;
    expect(seed).toBeTruthy();

    deleteCustomer(seed.id);
    expect(isSoftDeleted(seed.id)).toBe(true);
    expect(listAllCustomers().some((c) => c.id === seed.id)).toBe(false);
  });
});
