import { describe, expect, it } from "vitest";
import {
  findPotentialDuplicateClients,
  normalizeDocument,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "./duplicate-detection";
import { mockCustomers } from "@/lib/mock-data/customers";

const BIZ = "biz_dermaland";

describe("normalizadores", () => {
  it("normaliza nombre con acentos y espacios", () => {
    expect(normalizeName("  María  Fernanda ")).toBe("maria fernanda");
    expect(normalizeName("José Ángel")).toBe("jose angel");
  });

  it("normaliza teléfono con +1, espacios y guiones", () => {
    expect(normalizePhone("+1 (809) 555-0000")).toBe("8095550000");
    expect(normalizePhone("8095550000")).toBe("8095550000");
    expect(normalizePhone("18095550000")).toBe("8095550000");
  });

  it("normaliza email — lowercase y trim", () => {
    expect(normalizeEmail("  Cliente@Email.COM ")).toBe("cliente@email.com");
  });

  it("normaliza documento — sin guiones, mayúsculas", () => {
    expect(normalizeDocument("031-0234567-8")).toBe("03102345678");
    expect(normalizeDocument("ab12-3456")).toBe("AB123456");
  });
});

describe("Detección de duplicados (R-CRM-01)", () => {
  it("detecta duplicado por documento aunque se escriba sin guiones", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "Otro",
        lastName: "Nombre",
        documentNumber: "03102345678", // mismo cust_001 pero sin guiones
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.confidence).toBe("high");
    expect(r.matches[0]?.reasons).toContain("documento");
  });

  it("detecta duplicado por teléfono", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "Persona",
        lastName: "Nueva",
        phone: "8095551101", // mismo de cust_001 sin guiones
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.reasons).toContain("teléfono");
  });

  it("detecta duplicado por WhatsApp", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "Foo",
        lastName: "Bar",
        whatsapp: "+1 809-555-1101",
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.reasons).toContain("WhatsApp");
  });

  it("detecta duplicado por email — case insensitive", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "X",
        lastName: "Y",
        email: "MF.CABRAL@gmail.com",
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.reasons).toContain("email");
  });

  it("detecta duplicado por nombre + apellido + fecha de nacimiento", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "María Fernanda",
        lastName: "Cabral",
        birthDate: "1992-03-14",
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.confidence).toBe("high");
  });

  it("NO detecta duplicado en otro business (multitenancy)", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "María Fernanda",
        lastName: "Cabral",
        documentNumber: "031-0234567-8",
        businessId: "biz_otro_unknown",
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(false);
    expect(r.matches).toHaveLength(0);
  });

  it("excludeClientId: no se detecta como duplicado de sí mismo (caso edición)", () => {
    // Pasar todos los datos del propio cust_001 como candidato → sin
    // excludeClientId daría high; con excludeClientId debe dar 0 matches.
    const me = mockCustomers.find((c) => c.id === "cust_001")!;
    const candidate = {
      firstName: me.firstName,
      lastName: me.lastName,
      documentNumber: me.documentNumber,
      phone: me.phone,
      whatsapp: me.whatsapp,
      email: me.email,
      birthDate: me.birthDate,
      businessId: BIZ,
    };

    const without = findPotentialDuplicateClients(candidate, mockCustomers);
    expect(without.isDuplicate).toBe(true);

    const withExcl = findPotentialDuplicateClients(candidate, mockCustomers, {
      excludeClientId: "cust_001",
    });
    expect(withExcl.isDuplicate).toBe(false);
    expect(withExcl.matches).toHaveLength(0);
  });

  it("excludeClientId: sí detecta si el match es OTRO cliente (no el propio)", () => {
    // cust_002 cambia su teléfono al de cust_001 → debe detectarlo aunque
    // se excluya cust_002.
    const otro = mockCustomers.find((c) => c.id === "cust_001")!;
    const r = findPotentialDuplicateClients(
      {
        firstName: "Cualquiera",
        lastName: "Otro",
        phone: otro.phone, // robado de cust_001
        businessId: BIZ,
      },
      mockCustomers,
      { excludeClientId: "cust_002" },
    );
    expect(r.isDuplicate).toBe(true);
    expect(r.matches[0]?.customer.id).toBe("cust_001");
  });

  it("permite cliente totalmente nuevo", () => {
    const r = findPotentialDuplicateClients(
      {
        firstName: "Pedro",
        lastName: "Pérez",
        documentNumber: "088-1234567-9",
        phone: "+1 829-999-0000",
        email: "pedro.perez@email.com",
        birthDate: "2000-01-01",
        businessId: BIZ,
      },
      mockCustomers,
    );
    expect(r.isDuplicate).toBe(false);
    expect(r.matches).toHaveLength(0);
  });
});
