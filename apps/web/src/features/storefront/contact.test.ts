import { describe, expect, it } from "vitest";
import { productInquiryMessage, whatsappLink, whatsappNumber } from "./contact";

describe("whatsappNumber", () => {
  it("añade el código de país a un número dominicano de 10 dígitos", () => {
    expect(whatsappNumber("809-226-5252")).toBe("18092265252");
    expect(whatsappNumber("(829) 555 0000")).toBe("18295550000");
  });

  it("respeta un número que ya trae código de país", () => {
    expect(whatsappNumber("+1 809-226-5252")).toBe("18092265252");
  });

  it("devuelve null cuando no hay número marcable", () => {
    // Sin esto, la interfaz pintaría un botón a `https://wa.me/` que abre
    // WhatsApp con una conversación en blanco: la venta se pierde sin error.
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("   ")).toBeNull();
    expect(whatsappNumber("sin teléfono")).toBeNull();
    expect(whatsappNumber("809-226")).toBeNull();
  });
});

describe("whatsappNumber con un enlace pegado", () => {
  it("lee el numero de un wa.me", () => {
    // Es lo que el duenno pego de verdad en el campo de la tienda.
    expect(whatsappNumber("https://wa.me/18297141975")).toBe("18297141975");
  });

  it("ignora el mensaje prellenado en vez de tragarse sus digitos", () => {
    // Sin esto, los digitos de "%2C%20" se pegaban al numero y el boton abria
    // una conversacion con un numero inexistente. Sin error y sin aviso.
    expect(
      whatsappNumber("https://wa.me/18297141975?text=Hola%2C%20soy%20cliente"),
    ).toBe("18297141975");
  });

  it("lee el parametro phone= de api.whatsapp.com", () => {
    expect(
      whatsappNumber("https://api.whatsapp.com/send?phone=18297141975&text=hola"),
    ).toBe("18297141975");
  });

  it("acepta el enlace sin protocolo", () => {
    expect(whatsappNumber("wa.me/8297141975")).toBe("18297141975");
  });

  it("el telefono suelto sigue funcionando igual", () => {
    expect(whatsappNumber("829-714-1975")).toBe("18297141975");
    expect(whatsappNumber("")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("codifica el mensaje", () => {
    const url = whatsappLink("8092265252", "Hola, me interesa: AVÈNE CICALFATE+");
    expect(url).toBe(
      "https://wa.me/18092265252?text=Hola%2C%20me%20interesa%3A%20AV%C3%88NE%20CICALFATE%2B",
    );
  });

  it("sin mensaje devuelve solo el enlace", () => {
    expect(whatsappLink("8092265252")).toBe("https://wa.me/18092265252");
  });

  it("sin número no hay enlace", () => {
    expect(whatsappLink(undefined, "Hola")).toBeNull();
  });
});

describe("productInquiryMessage", () => {
  it("incluye el producto y su enlace", () => {
    expect(
      productInquiryMessage("Avène Cicalfate+", "https://dermaland.vercel.app/tienda/producto/avene"),
    ).toBe(
      "Hola, me interesa este producto: Avène Cicalfate+ — https://dermaland.vercel.app/tienda/producto/avene",
    );
  });
});
