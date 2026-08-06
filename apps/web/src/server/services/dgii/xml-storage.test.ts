import { describe, expect, it } from "vitest";
import { sha256, xmlPath } from "./xml-storage";

/**
 * La ruta de un XML fiscal.
 *
 * Parece trivial y no lo es: la política de RLS del bucket compara la **primera
 * carpeta** de la ruta con el negocio del usuario. Si el `business_id` dejara de
 * ir primero, el aislamiento entre negocios se caería sin que nada fallara —
 * cualquiera podría descargar los comprobantes de otro.
 */

describe("dónde vive cada XML", () => {
  it("el negocio va PRIMERO: de eso depende el aislamiento", () => {
    const p = xmlPath("biz-1", "ecf", "E310000000001", "signed");
    expect(p.split("/")[0]).toBe("biz-1");
  });

  it("el ambiente separa las pruebas de lo real", () => {
    // El mismo e-NCF existe en pruebas y en producción. Sin el ambiente en la
    // ruta, una prueba sobrescribiría el documento fiscal de verdad.
    const prueba = xmlPath("biz-1", "testecf", "E310000000001", "signed");
    const real = xmlPath("biz-1", "ecf", "E310000000001", "signed");
    expect(prueba).not.toBe(real);
  });

  it("los tres artefactos de un mismo comprobante no se pisan", () => {
    const rutas = (["generated", "signed", "response"] as const).map((k) =>
      xmlPath("biz-1", "ecf", "E310000000001", k),
    );
    expect(new Set(rutas).size).toBe(3);
  });

  it("es estable: la misma entrada da la misma ruta", () => {
    expect(xmlPath("b", "ecf", "E310000000001", "signed")).toBe(
      xmlPath("b", "ecf", "E310000000001", "signed"),
    );
  });
});

describe("el hash del documento", () => {
  it("cambia si cambia un solo carácter", () => {
    // Es lo que permite demostrar que un XML firmado no se tocó.
    expect(sha256("<ECF>a</ECF>")).not.toBe(sha256("<ECF>b</ECF>"));
  });

  it("es el SHA-256 de siempre, en hexadecimal", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
