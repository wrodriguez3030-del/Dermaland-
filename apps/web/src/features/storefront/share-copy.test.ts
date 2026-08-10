import { describe, expect, it } from "vitest";
import {
  MAX_SHARE_DESCRIPTION,
  storefrontShareDescription,
} from "./share-copy";

describe("storefrontShareDescription", () => {
  it("la descripción escrita por el dueño manda sola", () => {
    expect(
      storefrontShareDescription({
        seoDescription: "Las mejores marcas de dermocosmética del Cibao.",
        tagline: "Un lema cualquiera",
      }),
    ).toBe("Las mejores marcas de dermocosmética del Cibao.");
  });

  it("al lema le añade lo que se puede hacer en la tienda", () => {
    // Es el caso real de produccion: el lema estaba puesto y la tarjeta no
    // decia en ninguna parte que ahi se pudiera comprar.
    expect(
      storefrontShareDescription({
        tagline: "Dermocosmética y cuidado de la piel en Santiago",
      }),
    ).toBe(
      "Dermocosmética y cuidado de la piel en Santiago. Compra en línea con envío a domicilio o retiro en sucursal.",
    );
  });

  it("no duplica el punto si el lema ya termina en uno", () => {
    const r = storefrontShareDescription({ tagline: "Tu piel, primero." });
    expect(r).toBe(
      "Tu piel, primero. Compra en línea con envío a domicilio o retiro en sucursal.",
    );
    expect(r).not.toContain("..");
  });

  it("sin lema usa la ciudad", () => {
    expect(storefrontShareDescription({ city: "Santiago" })).toContain(
      "en Santiago",
    );
  });

  it("sin nada dice algo que se sostiene", () => {
    const r = storefrontShareDescription({});
    expect(r.length).toBeGreaterThan(20);
    expect(r).toContain("Compra en línea");
  });

  it("respeta el tope y no parte una palabra por la mitad", () => {
    const largo = "Palabra ".repeat(40).trim();
    const r = storefrontShareDescription({ seoDescription: largo });
    expect(r.length).toBeLessThanOrEqual(MAX_SHARE_DESCRIPTION);
    expect(r.endsWith("…")).toBe(true);
    expect(r).not.toContain("Palab…");
  });

  it("ignora el espacio en blanco como si no hubiera dato", () => {
    expect(
      storefrontShareDescription({ seoDescription: "   ", tagline: "Lema" }),
    ).toContain("Lema");
  });
});
