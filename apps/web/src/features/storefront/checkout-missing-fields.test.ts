import { describe, expect, it } from "vitest";
import {
  missingCheckoutFields,
  type CheckoutSnapshot,
} from "./checkout-missing-fields";

const completoRetiro: CheckoutSnapshot = {
  nombre: "Ana Pérez",
  telefono: "809-555-1234",
  entrega: "pickup",
  provincia: "",
  sector: "",
  direccion: "",
};

const completoEnvio: CheckoutSnapshot = {
  nombre: "Ana Pérez",
  telefono: "809-555-1234",
  entrega: "delivery",
  provincia: "santiago",
  sector: "Los Jardines",
  direccion: "Calle 8 #12",
};

describe("missingCheckoutFields", () => {
  it("con todo vacío pide nombre, teléfono y entrega — y NADA de envío aún", () => {
    const faltan = missingCheckoutFields({
      nombre: "",
      telefono: "",
      entrega: null,
      provincia: "",
      sector: "",
      direccion: "",
    });
    expect(faltan.map((f) => f.field)).toEqual([
      "contactName",
      "contactPhone",
      "fulfillment",
    ]);
  });

  it("retiro completo no pide nada", () => {
    expect(missingCheckoutFields(completoRetiro)).toEqual([]);
  });

  it("envío completo no pide nada", () => {
    expect(missingCheckoutFields(completoEnvio)).toEqual([]);
  });

  it("envío elegido sin dirección pide provincia, sector y dirección", () => {
    const faltan = missingCheckoutFields({
      ...completoEnvio,
      provincia: "",
      sector: "",
      direccion: "",
    });
    expect(faltan.map((f) => f.field)).toEqual([
      "province",
      "sector",
      "address",
    ]);
  });

  it("los espacios en blanco cuentan como vacío", () => {
    const faltan = missingCheckoutFields({ ...completoRetiro, nombre: "   " });
    expect(faltan.map((f) => f.field)).toEqual(["contactName"]);
  });

  it("la entrega sin elegir usa el texto que ya conoce el cliente", () => {
    const faltan = missingCheckoutFields({ ...completoRetiro, entrega: null });
    expect(faltan[0]?.message).toBe(
      "Elige si lo retiras en sucursal o te lo llevamos.",
    );
  });

  it("cada faltante trae etiqueta para el resumen y mensaje para el campo", () => {
    const faltan = missingCheckoutFields({ ...completoRetiro, telefono: "" });
    expect(faltan).toEqual([
      {
        field: "contactPhone",
        label: "tu teléfono",
        message: "Falta tu teléfono.",
      },
    ]);
  });
});
