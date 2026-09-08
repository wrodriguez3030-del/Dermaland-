import { describe, it, expect } from "vitest";
import { generarClaveLegible, esClaveAceptable } from "./password-generator";
import { PASSWORD_MIN_LENGTH } from "./password-policy";

/**
 * Estas claves se las entrega un administrador a una persona para que entre al
 * sistema. Una que la política rechace deja al administrador probando otra vez
 * delante del usuario; una con `0` y `O` mezclados se dicta mal por teléfono,
 * que es como van a viajar de verdad.
 */
describe("generador de claves", () => {
  it("🔴 mil claves seguidas pasan TODAS la política de la casa", () => {
    // Una de cada quinientos que fallara sería un fallo que solo aparece
    // cuando ya hay alguien esperando.
    for (let i = 0; i < 1000; i++) {
      const clave = generarClaveLegible();
      expect(esClaveAceptable(clave), `clave rechazada: ${clave}`).toBe(true);
    }
  });

  it("🔴 nunca lleva caracteres que se confunden al dictar", () => {
    for (let i = 0; i < 500; i++) {
      expect(generarClaveLegible()).not.toMatch(/[0O1lI]/);
    }
  });

  it("tiene la forma XXXX-XXXX-XXXX y supera el mínimo de la política", () => {
    const clave = generarClaveLegible();
    expect(clave).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(clave.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
  });

  it("🔴 siempre trae mayúscula, minúscula y dígito", () => {
    for (let i = 0; i < 200; i++) {
      const clave = generarClaveLegible();
      expect(clave, `sin mayúscula: ${clave}`).toMatch(/[A-Z]/);
      expect(clave, `sin minúscula: ${clave}`).toMatch(/[a-z]/);
      expect(clave, `sin dígito: ${clave}`).toMatch(/[2-9]/);
    }
  });

  it("dos claves seguidas no son iguales", () => {
    const vistas = new Set(Array.from({ length: 100 }, () => generarClaveLegible()));
    expect(vistas.size).toBe(100);
  });

  it("usa la fuente aleatoria que se le pasa, no Math.random", () => {
    let llamadas = 0;
    generarClaveLegible((n) => {
      llamadas++;
      return new Uint8Array(n).fill(7);
    });
    expect(llamadas).toBeGreaterThan(10);
  });
});

describe("esClaveAceptable", () => {
  it("🔴 rechaza una clave con espacios al borde", () => {
    // Lo que se guarda en la bóveda tiene que ser EXACTAMENTE lo que se le fija
    // a la cuenta: un espacio invisible al final es la diferencia que nadie
    // encuentra mirando.
    expect(esClaveAceptable("Clave-Buena-2345 ")).toBe(false);
    expect(esClaveAceptable(" Clave-Buena-2345")).toBe(false);
    expect(esClaveAceptable("Clave-Buena-2345")).toBe(true);
  });

  it("rechaza lo que rechaza la política (corta, trivial)", () => {
    expect(esClaveAceptable("corta")).toBe(false);
    expect(esClaveAceptable("")).toBe(false);
  });
});
