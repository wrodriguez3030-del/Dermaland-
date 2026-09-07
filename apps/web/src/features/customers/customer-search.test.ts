import { describe, it, expect } from "vitest";
import { coincideCliente, normalizarTexto } from "./customer-search";
import type { Customer } from "@/types";

/**
 * El buscador de la pantalla de Clientes existía pero no estaba conectado: un
 * `<input>` sin valor ni manejador. Con 6 524 clientes, encontrar a alguien
 * exigía pasar páginas a mano.
 *
 * Los casos de aquí son los que de verdad teclea alguien en un mostrador: el
 * apellido primero, la cédula con guiones, el teléfono con espacios, el nombre
 * sin tildes porque el teclado va rápido.
 */

const cliente = (p: Partial<Customer>): Customer =>
  ({
    id: "c1",
    customerNumber: "CLI-0001",
    firstName: "Laura",
    lastName: "Mejía",
    documentNumber: "031-0327428-2",
    phone: "+1 (829) 714-1975",
    email: "Laura.Mejia@Correo.com",
    source: "import",
    skinType: "not_specified",
    ...p,
  }) as Customer;

describe("normalizarTexto", () => {
  it("🔴 quita tildes: «Muñoz» se encuentra tecleando «munoz»", () => {
    expect(normalizarTexto("Muñoz")).toBe("munoz");
    expect(normalizarTexto("MEJÍA")).toBe("mejia");
  });
});

describe("coincideCliente", () => {
  const c = cliente({});

  it("una búsqueda vacía no filtra a nadie", () => {
    expect(coincideCliente(c, "")).toBe(true);
    expect(coincideCliente(c, "   ")).toBe(true);
  });

  it("🔴 por nombre, SIN tildes", () => {
    expect(coincideCliente(c, "mejia")).toBe(true);
    expect(coincideCliente(c, "LAURA")).toBe(true);
  });

  it("🔴 por apellido PRIMERO: nadie recuerda en qué orden lo tecleó", () => {
    expect(coincideCliente(c, "mejia laura")).toBe(true);
  });

  it("🔴 por cédula con guiones, aunque esté guardada sin ellos", () => {
    const conDoc = cliente({ documentNumber: "03103274282" });
    expect(coincideCliente(conDoc, "031-0327428-2")).toBe(true);
    expect(coincideCliente(conDoc, "0310327428")).toBe(true);
  });

  it("🔴 por teléfono con espacios y prefijo de país", () => {
    expect(coincideCliente(c, "829 714 1975")).toBe(true);
    expect(coincideCliente(c, "8297141975")).toBe(true);
    expect(coincideCliente(c, "+1 829 714 1975")).toBe(true);
  });

  it("encuentra por el WhatsApp aunque el teléfono sea otro", () => {
    const wa = cliente({ phone: "809-000-0000", whatsapp: "829-714-1975" });
    expect(coincideCliente(wa, "8297141975")).toBe(true);
  });

  it("por correo, sin importar mayúsculas", () => {
    expect(coincideCliente(c, "laura.mejia@correo.com")).toBe(true);
  });

  it("por número de cliente", () => {
    expect(coincideCliente(c, "CLI-0001")).toBe(true);
  });

  it("🔴 dos palabras ACOTAN, no amplían", () => {
    const otra = cliente({ firstName: "Laura", lastName: "Pérez", documentNumber: "", phone: "", email: "" });
    expect(coincideCliente(otra, "laura")).toBe(true);
    // «laura mejia» NO debe devolver a Laura Pérez.
    expect(coincideCliente(otra, "laura mejia")).toBe(false);
  });

  it("quien no coincide, no sale", () => {
    expect(coincideCliente(c, "gonzalez")).toBe(false);
    expect(coincideCliente(c, "8090000000")).toBe(false);
  });

  it("aguanta un cliente con los campos vacíos", () => {
    const vacio = cliente({
      firstName: "",
      lastName: "",
      documentNumber: undefined,
      phone: undefined,
      email: undefined,
    });
    expect(coincideCliente(vacio, "algo")).toBe(false);
    expect(coincideCliente(vacio, "")).toBe(true);
  });
});
