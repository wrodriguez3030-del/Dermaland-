import { describe, expect, it } from "vitest";
import { toLocalPhoneDigits } from "./phone";

describe("toLocalPhoneDigits", () => {
  it("acepta el formato que produce la máscara del sistema", () => {
    // `formatDominicanPhone` es lo que teclea el cliente con la máscara puesta.
    expect(toLocalPhoneDigits("809-555-1234")).toBe("8095551234");
    expect(toLocalPhoneDigits("+1 809-555-1234")).toBe("8095551234");
  });

  it("acepta el código de país escrito de todas las formas", () => {
    // ESTE es el fallo que rompía el checkout: con "+1" son 11 dígitos y la
    // validación exigía exactamente 10, así que el pedido se rechazaba y React
    // vaciaba el formulario. El cliente no veía por qué.
    for (const v of [
      "18095551234",
      "+18095551234",
      "1-809-555-1234",
      "+1 (809) 555-1234",
      "1 809 555 1234",
    ]) {
      expect(toLocalPhoneDigits(v)).toBe("8095551234");
    }
  });

  it("acepta como lo escribe la gente de verdad", () => {
    for (const v of [
      "8095551234",
      "809 555 1234",
      "(809) 555-1234",
      "809.555.1234",
      "  809-555-1234  ",
    ]) {
      expect(toLocalPhoneDigits(v)).toBe("8095551234");
    }
  });

  it("rechaza lo que no llega a un teléfono marcable", () => {
    for (const v of ["", "  ", "809", "80955512", "abc", null, undefined]) {
      expect(toLocalPhoneDigits(v as string)).toBeNull();
    }
  });

  it("rechaza lo que se pasa de largo", () => {
    // 11 dígitos que NO empiezan por 1 no es un teléfono dominicano.
    expect(toLocalPhoneDigits("28095551234")).toBeNull();
    expect(toLocalPhoneDigits("123456789012345")).toBeNull();
  });

  it("devuelve siempre 10 dígitos limpios o null, nunca otra cosa", () => {
    const r = toLocalPhoneDigits("+1 (829) 111-2222");
    expect(r).toBe("8291112222");
    expect(r).toMatch(/^\d{10}$/);
  });
});
