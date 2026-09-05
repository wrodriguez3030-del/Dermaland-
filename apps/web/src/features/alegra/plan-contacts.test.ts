import { describe, it, expect } from "vitest";
import { planContacts, type ContactAction, type ExistingClient } from "./plan-contacts";
import type { AlegraContact } from "./types";

const c = (over: Partial<AlegraContact>): AlegraContact => ({
  id: "1",
  name: "Juan Perez",
  phonePrimary: null,
  mobile: null,
  email: null,
  identification: null,
  status: "active",
  type: ["client"],
  updated_at: "2026-09-01T00:00:00.000Z",
  ...over,
});
const e = (over: Partial<ExistingClient>): ExistingClient => ({
  id: "c1",
  firstName: "Juan",
  lastName: "Perez",
  phoneDigits: null,
  whatsappDigits: null,
  emailNormalized: null,
  createdAt: "2026-01-01T00:00:00Z",
  alegraId: null,
  alegraUpdatedAt: null,
  documentNormalized: null,
  phone: null,
  email: null,
  documentNumber: null,
  ...over,
});

describe("planContacts", () => {
  it("crea cuando no hay nada con qué emparejar (ni teléfono, ni correo, ni documento)", () => {
    const acciones = planContacts([c({ id: "10" })], [e({})]);
    expect(acciones[0]!.kind).toBe("create");
  });

  it("ignora contactos que no son clientes", () => {
    expect(planContacts([c({ id: "10", type: ["provider"] })], [])).toEqual([]);
  });

  it("empareja por alegra_id ya guardado y omite si Alegra no cambió desde la última vez", () => {
    const acciones = planContacts(
      [c({ id: "10", updated_at: "2026-09-01T00:00:00.000Z" })],
      [e({ id: "c9", alegraId: "10", alegraUpdatedAt: "2026-09-01T00:00:00.000Z" })],
    );
    expect(acciones[0]).toMatchObject({ kind: "skip", clientId: "c9", reason: "unchanged" });
  });

  it("empareja por alegra_id y actualiza si Alegra cambió después", () => {
    const acciones = planContacts(
      [c({ id: "10", updated_at: "2026-09-02T00:00:00.000Z", email: "nuevo@x.com" })],
      [e({ id: "c9", alegraId: "10", alegraUpdatedAt: "2026-09-01T00:00:00.000Z" })],
    );
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c9", reason: "alegra_id", fill: { email: "nuevo@x.com" } });
  });

  it("empareja por teléfono (con guiones vs sin guiones) y rellena solo lo vacío", () => {
    const acciones = planContacts(
      [c({ id: "10", phonePrimary: "8295550182", email: "a@b.com" })],
      [e({ id: "c2", phoneDigits: "8295550182", phone: "829-555-0182", email: null })],
    );
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c2", reason: "phone", fill: { email: "a@b.com" } });
    expect((acciones[0] as { fill: Record<string, unknown> }).fill).not.toHaveProperty("phone");
  });

  it("empareja por correo cuando no hay teléfono", () => {
    const acciones = planContacts([c({ id: "10", email: "A@B.com" })], [e({ id: "c8", emailNormalized: "a@b.com" })]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c8", reason: "email" });
  });

  it("empareja por documento cuando no hay teléfono ni correo", () => {
    const acciones = planContacts([c({ id: "10", identification: "40200000001" })], [e({ id: "c3", documentNormalized: "40200000001" })]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c3", reason: "document" });
  });

  it("NUNCA empareja solo por nombre", () => {
    const acciones = planContacts([c({ id: "10", name: "Juan Perez" })], [e({ id: "c4", firstName: "Juan", lastName: "Perez" })]);
    expect(acciones[0]!.kind).toBe("create");
  });

  it("entre dos fichas con el mismo teléfono gana la más antigua", () => {
    const acciones = planContacts([c({ id: "10", phonePrimary: "8295550182" })], [
      e({ id: "nueva", phoneDigits: "8295550182", createdAt: "2026-08-01T00:00:00Z" }),
      e({ id: "vieja", phoneDigits: "8295550182", createdAt: "2025-01-01T00:00:00Z" }),
    ]);
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "vieja" });
  });

  it("una ficha ya vinculada a OTRO alegra_id no se reutiliza (Alegra tiene dos contactos con el mismo teléfono)", () => {
    const acciones = planContacts([c({ id: "10", phonePrimary: "8295550182" })], [e({ id: "c5", phoneDigits: "8295550182", alegraId: "99" })]);
    expect(acciones[0]!.kind).toBe("create");
  });

  // 2026-09-05: `clients_business_document_unique` tumbó 5 altas. Alegra repite
  // identificaciones (incluida la de relleno "00000000000"); DermaLand exige
  // que el documento sea único. La ficha se crea igual, pero sin documento.
  it("dos contactos con el mismo documento: el segundo se crea SIN documento", () => {
    const acciones = planContacts(
      [c({ id: "10", identification: "40200000001" }), c({ id: "11", name: "Otra Persona", identification: "40200000001" })],
      [],
    );
    expect(acciones[0]).toMatchObject({ kind: "create", draft: { documentNumber: "40200000001" } });
    expect(acciones[1]).toMatchObject({ kind: "create", draft: { documentNumber: null, documentType: null } });
    expect((acciones[1] as Extract<ContactAction, { kind: "create" }>).draft.firstName).toBe("Otra");
  });

  it("si el documento lo tiene una ficha YA enlazada a otro contacto de Alegra, la nueva se crea sin documento", () => {
    const acciones = planContacts(
      [c({ id: "10", phonePrimary: "8095550000", identification: "40200000001" })],
      // c7 ya está enlazada a otro alegra_id: no es candidata, pero su documento
      // ocupa el índice único.
      [e({ id: "c7", alegraId: "99", documentNormalized: "40200000001", documentNumber: "40200000001" })],
    );
    expect(acciones[0]).toMatchObject({ kind: "create", draft: { documentNumber: null, documentType: null } });
  });

  it("si el documento está en una ficha libre, la enlaza en vez de crear (es la misma persona)", () => {
    const acciones = planContacts(
      [c({ id: "10", identification: "40200000001" })],
      [e({ id: "c7", documentNormalized: "40200000001", documentNumber: "40200000001" })],
    );
    expect(acciones[0]).toMatchObject({ kind: "link", clientId: "c7", reason: "document" });
  });

  it("dos contactos de Alegra con el mismo teléfono no se enlazan a la misma ficha: el segundo se crea", () => {
    const acciones = planContacts(
      [c({ id: "10", phonePrimary: "8295550182" }), c({ id: "11", name: "Pedro Perez", phonePrimary: "8295550182" })],
      [e({ id: "c6", phoneDigits: "8295550182" })],
    );
    expect(acciones.map((a) => a.kind)).toEqual(["link", "create"]);
  });
});
