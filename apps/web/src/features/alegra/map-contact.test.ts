import { describe, it, expect } from "vitest";
import contacto from "./__fixtures__/contact-con-telefono.json";
import { contactToClientDraft, contactToSupplierDraft, isClient, isProvider } from "./map-contact";
import type { AlegraContact } from "./types";

const base = contacto as AlegraContact;

describe("contactToClientDraft", () => {
  it("parte el nombre, formatea el teléfono con guiones y detecta cédula (11 dígitos)", () => {
    const d = contactToClientDraft(base);
    expect(d.firstName).toBe("Ana");
    expect(d.lastName).toBe("Prueba Rodriguez");
    expect(d.phone).toBe("829-555-0182");
    expect(d.whatsapp).toBe("829-555-0182");
    expect(d.documentType).toBe("cedula");
    expect(d.documentNumber).toBe("40200000001");
    expect(d.active).toBe(true);
    expect(d.alegraId).toBe("5691");
    expect(d.alegraUpdatedAt).toBe("2026-04-23T21:03:01.000Z");
  });

  it("RNC de 9 dígitos → rnc; otra cosa → passport; vacío → null; usa mobile si no hay phonePrimary", () => {
    expect(contactToClientDraft({ ...base, identification: "130984395" }).documentType).toBe("rnc");
    expect(contactToClientDraft({ ...base, identification: "AB1234" }).documentType).toBe("passport");
    expect(contactToClientDraft({ ...base, identification: null }).documentType).toBeNull();
    expect(contactToClientDraft({ ...base, phonePrimary: null, mobile: "(809) 555 0101" }).phone).toBe("809-555-0101");
    expect(contactToClientDraft({ ...base, phonePrimary: null, mobile: null }).phone).toBeNull();
    expect(contactToClientDraft({ ...base, status: "inactive" }).active).toBe(false);
  });

  it("identificationObject.number manda sobre identification cuando viene lleno", () => {
    const d = contactToClientDraft({ ...base, identificationObject: { type: "RNC", number: "1-31-79421-1" } });
    expect(d.documentType).toBe("rnc");
    expect(d.documentNumber).toBe("131794211");
  });

  it("un correo sin arroba no vale; el correo se guarda en minúsculas", () => {
    expect(contactToClientDraft({ ...base, email: "sin-correo" }).email).toBeNull();
    expect(contactToClientDraft({ ...base, email: " Ana@Ejemplo.COM " }).email).toBe("ana@ejemplo.com");
  });

  it("proveedor: nombre tal cual, rnc si es de 9 dígitos", () => {
    const p = contactToSupplierDraft({ ...base, id: "2477", name: "Managament Company", identification: "131794211", type: ["provider"] });
    expect(p).toEqual({ name: "Managament Company", rnc: "131794211", phone: "829-555-0182", email: null, alegraId: "2477" });
    expect(isProvider({ ...base, type: ["provider"] })).toBe(true);
    // 2026-09-05: 40 contactos de Alegra vienen con `type: []` y SÍ tienen
    // facturas (LUISA DE LEON, id 256). Sin esto se quedaban sin ficha y sus
    // 177 facturas sin cliente enlazado.
    expect(isClient({ ...base, type: [] })).toBe(true);
    expect(isProvider({ ...base, type: [] })).toBe(false);
    expect(isProvider(base)).toBe(false);
    expect(isClient({ ...base, type: ["client", "provider"] })).toBe(true);
  });
});
