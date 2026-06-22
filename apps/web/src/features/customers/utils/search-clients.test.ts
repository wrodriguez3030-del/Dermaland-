import { describe, expect, it } from "vitest";
import { searchClients } from "./search-clients";
import { mockCustomers } from "@/lib/mock-data/customers";
import type { Customer } from "@/types";

const BIZ = "biz_dermaland";

/**
 * Cliente real tal como lo devuelve Supabase: `businessId` es el UUID del
 * negocio (NO la constante mock "biz_dermaland"). Reproduce el caso de
 * producción WILLIAN R RODRIGUEZ.
 */
const WILLIAN = {
  id: "real-willian",
  businessId: "00000000-0000-0000-0000-00000000d001",
  customerNumber: "CLI-000099",
  firstName: "WILLIAN R",
  lastName: "RODRIGUEZ",
  documentType: "cedula",
  documentNumber: "031-0327428-2",
  phone: "829-714-1975",
  email: "wrodriguez3030@gmail.com",
  source: "manual",
  tags: [],
  defaultBillingType: "consumo",
  skinType: "no_especificado",
  totalSpent: 0,
  totalOrders: 0,
  consents: [],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
} as unknown as Customer;

describe("searchClients", () => {
  it("query vacía devuelve primeros N por última visita", () => {
    const r = searchClients("", mockCustomers, { businessId: BIZ, limit: 3 });
    expect(r).toHaveLength(3);
    // El primer resultado debe ser el de visita más reciente
    expect(r[0]?.id).toBe("cust_005"); // Carlos Mejía visitó 2026-05-05T08:00
  });

  it("query con 1 carácter devuelve vacío", () => {
    expect(searchClients("M", mockCustomers, { businessId: BIZ })).toHaveLength(0);
  });

  it("encuentra por nombre con acentos invertidos", () => {
    const r = searchClients("maria", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por nombre — case insensitive", () => {
    const r = searchClients("CABRAL", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por teléfono parcial", () => {
    const r = searchClients("8095551101", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por teléfono con +1 y guiones", () => {
    const r = searchClients("+1 809-555-1101", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por código de área (3 dígitos)", () => {
    const r = searchClients("829", mockCustomers, { businessId: BIZ });
    // Juan Carlos tiene 829-555-1102, Andrea 829-555-1104
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("encuentra por cédula sin guiones", () => {
    const r = searchClients("0310234567", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por cédula con guiones", () => {
    const r = searchClients("031-0234567-8", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por email parcial", () => {
    const r = searchClients("mf.cabral", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_001")).toBeTruthy();
  });

  it("encuentra por customer number", () => {
    const r = searchClients("CLI-000005", mockCustomers, { businessId: BIZ });
    expect(r.find((c) => c.id === "cust_005")).toBeTruthy();
  });

  it("respeta businessId — no devuelve clientes de otro tenant", () => {
    const r = searchClients("maria", mockCustomers, {
      businessId: "biz_otro_unknown",
    });
    expect(r).toHaveLength(0);
  });

  it("limita resultados con `limit`", () => {
    const r = searchClients("", mockCustomers, { businessId: BIZ, limit: 2 });
    expect(r).toHaveLength(2);
  });

  it("retorna [] si no hay coincidencias", () => {
    const r = searchClients("xyznonsense", mockCustomers, { businessId: BIZ });
    expect(r).toHaveLength(0);
  });
});

describe("searchClients — cliente real de Supabase (regresión POS WILLIAN)", () => {
  const list = [WILLIAN];

  // El POS ahora NO pasa businessId (los datos ya vienen scopeados por RLS).
  it.each([
    ["WILL"],
    ["WILLIAN"],
    ["RODRIGUEZ"],
    ["rodriguez"],
    ["829"],
    ["8297141975"],
    ["829-714-1975"],
    ["wrodriguez"],
    ["03103274282"],
    ["031-0327428-2"],
  ])("encuentra a WILLIAN buscando %s", (q) => {
    const r = searchClients(q, list);
    expect(r.find((c) => c.id === "real-willian")).toBeTruthy();
  });

  it("BUG REPRODUCIDO: con el businessId mock 'biz_dermaland' NO lo encontraba", () => {
    const r = searchClients("WILL", list, { businessId: "biz_dermaland" });
    expect(r).toHaveLength(0);
  });

  it("con el businessId real (UUID) sí lo encuentra (RLS/scoping correcto)", () => {
    const r = searchClients("WILL", list, {
      businessId: "00000000-0000-0000-0000-00000000d001",
    });
    expect(r.find((c) => c.id === "real-willian")).toBeTruthy();
  });

  it("no cruza negocios: otro businessId no lo devuelve", () => {
    const r = searchClients("WILL", list, { businessId: "otro-negocio" });
    expect(r).toHaveLength(0);
  });
});
