import { describe, expect, it } from "vitest";
import { initialFulfillment } from "./checkout-fulfillment";

describe("initialFulfillment", () => {
  it("con envío configurado NO preselecciona nada", () => {
    // El fallo real: el selector arrancaba en "Retiro" y quien no lo tocaba
    // mandaba su pedido como retiro sin enterarse. Pasó con un cliente de
    // verdad, y la corrección se perdió por dejarse el inicializador sin tocar.
    expect(initialFulfillment(1)).toBeNull();
    expect(initialFulfillment(32)).toBeNull();
  });

  it("sin ninguna provincia con tarifa, solo cabe el retiro", () => {
    // Ahí no hay nada que elegir, y obligar a elegir entre una sola opción es
    // un paso de más.
    expect(initialFulfillment(0)).toBe("pickup");
  });

  it("un número raro no acaba preseleccionando envío", () => {
    expect(initialFulfillment(-1)).toBe("pickup");
    expect(initialFulfillment(Number.NaN)).toBe("pickup");
  });
});
