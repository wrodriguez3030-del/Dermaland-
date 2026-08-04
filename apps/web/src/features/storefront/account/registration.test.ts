import { describe, expect, it } from "vitest";
import { parseRegistration } from "./registration";

const VALIDO = {
  email: "  Ana.Perez@Example.COM ",
  password: "unaclavelarga1",
  firstName: " Ana ",
  lastName: " Pérez ",
  phone: "809-555-1234",
};

describe("parseRegistration", () => {
  it("normaliza correo, nombre y teléfono", () => {
    const r = parseRegistration(VALIDO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe("ana.perez@example.com");
    expect(r.value.firstName).toBe("Ana");
    expect(r.value.lastName).toBe("Pérez");
    // El teléfono se guarda en dígitos: así casa con el dedup, que compara
    // contra teléfonos tecleados de mil maneras distintas en el mostrador.
    expect(r.value.phone).toBe("8095551234");
  });

  it("exige un correo con forma de correo", () => {
    expect(parseRegistration({ ...VALIDO, email: "ana@" }).ok).toBe(false);
  });

  it("exige una clave de al menos 8 caracteres", () => {
    const r = parseRegistration({ ...VALIDO, password: "corta" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("8");
  });

  it("exige nombre y apellido", () => {
    expect(parseRegistration({ ...VALIDO, firstName: "  " }).ok).toBe(false);
    expect(parseRegistration({ ...VALIDO, lastName: "" }).ok).toBe(false);
  });

  it("exige un teléfono dominicano marcable", () => {
    expect(parseRegistration({ ...VALIDO, phone: "123" }).ok).toBe(false);
    expect(parseRegistration({ ...VALIDO, phone: "" }).ok).toBe(false);
  });

  it("acepta el teléfono escrito de cualquier manera", () => {
    for (const escrito of ["8095551234", "(809) 555-1234", "809 555 1234"]) {
      const r = parseRegistration({ ...VALIDO, phone: escrito });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.phone).toBe("8095551234");
    }
  });

  it("los mensajes de error son para una persona, no un volcado de zod", () => {
    const r = parseRegistration({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).not.toContain("invalid_type");
    expect(r.error.length).toBeLessThan(120);
  });

  it("no revienta con lo que no es un objeto", () => {
    // El formulario lo puede llamar cualquiera con cualquier cuerpo.
    expect(parseRegistration(null).ok).toBe(false);
    expect(parseRegistration("hola").ok).toBe(false);
    expect(parseRegistration([]).ok).toBe(false);
  });
});
