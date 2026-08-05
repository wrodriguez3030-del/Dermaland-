import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_ECF_TYPES,
  ECF_TYPE_RULES,
  type Presence,
} from "@/features/dgii/ecf-type-rules";
import { schemaPath } from "./xsd-registry";

/**
 * La tabla de reglas contra los esquemas de la DGII.
 *
 * `ecf-type-rules.ts` está escrita a mano, y una tabla escrita a mano se separa
 * de la verdad en cuanto nadie mira. Esta prueba vuelve a leer los XSD
 * oficiales y compara: si la DGII publica un esquema donde un campo cambia de
 * obligatorio a opcional —o al revés— **falla aquí**, no en producción con un
 * comprobante rechazado.
 *
 * Se hace con expresiones regulares y no con un parser de XML a propósito: los
 * esquemas son planos en la parte que importa, y una prueba que necesita su
 * propio parser es una prueba que también puede tener bugs.
 */

/** El XSD, sin el BOM que traen varios. */
function leerXsd(tipo: string): string {
  return readFileSync(schemaPath(tipo as never), "utf8").replace(/^﻿/, "");
}

/**
 * ¿Cómo declara el esquema este elemento?
 *
 * `null` = no aparece en absoluto → el tipo lo tiene prohibido.
 */
function presenciaEnXsd(xsd: string, elemento: string): Presence | null {
  const re = new RegExp(`<xs:element\\s+name="${elemento}"([^>]*)>`, "g");
  const m = re.exec(xsd);
  if (!m) return null;
  return /minOccurs\s*=\s*"0"/.test(m[1]!) ? "optional" : "required";
}

/** Un campo cuya sola presencia en el esquema decide si el tipo lo admite. */
function admite(xsd: string, elemento: string): boolean {
  return new RegExp(`<xs:element\\s+name="${elemento}"`).test(xsd);
}

describe("la tabla de reglas dice lo mismo que los XSD oficiales", () => {
  it("cubre los diez tipos y ninguno de más", () => {
    expect(ALL_ECF_TYPES.sort()).toEqual(
      ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"].sort(),
    );
  });

  it("el comprador coincide, tipo por tipo", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const xsd = leerXsd(tipo);
      const enEsquema = presenciaEnXsd(xsd, "Comprador");
      const enTabla = ECF_TYPE_RULES[tipo]!.comprador;

      if (enEsquema === null) {
        expect(enTabla, `${tipo}: el XSD no tiene Comprador`).toBe("forbidden");
      } else {
        expect(enTabla, `${tipo}: XSD dice ${enEsquema}`).toBe(enEsquema);
      }
    }
  });

  it("el RNC del comprador coincide", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const xsd = leerXsd(tipo);
      const enEsquema = presenciaEnXsd(xsd, "RNCComprador");
      const enTabla = ECF_TYPE_RULES[tipo]!.rncComprador;
      if (enEsquema === null) {
        expect(enTabla, `${tipo}: el XSD no tiene RNCComprador`).toBe("forbidden");
      } else {
        expect(enTabla, `${tipo}: XSD dice ${enEsquema}`).toBe(enEsquema);
      }
    }
  });

  it("lo PROHIBIDO está prohibido de verdad: el esquema ni lo menciona", () => {
    // Es la comprobación que evita el fallo caro: mandar un campo que el
    // esquema no conoce hace que la DGII rechace el comprobante entero.
    const campos: Array<[keyof (typeof ECF_TYPE_RULES)["31"], string]> = [
      ["paisComprador", "PaisComprador"],
      ["identificadorExtranjero", "IdentificadorExtranjero"],
      ["impuestosAdicionales", "ImpuestosAdicionales"],
      ["montoExento", "MontoExento"],
      ["informacionesAdicionales", "InformacionesAdicionales"],
      ["transporte", "Transporte"],
      ["descuentosORecargos", "DescuentosORecargos"],
    ];
    for (const tipo of ALL_ECF_TYPES) {
      const xsd = leerXsd(tipo);
      for (const [clave, elemento] of campos) {
        const reglas = ECF_TYPE_RULES[tipo]!;
        if (reglas[clave] === "forbidden") {
          expect(
            admite(xsd, elemento),
            `${tipo}: la tabla prohíbe ${elemento} pero el XSD SÍ lo admite`,
          ).toBe(false);
        }
      }
    }
  });

  it("el ITBIS: prohibido solo donde el esquema no lo tiene", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const xsd = leerXsd(tipo);
      const hayItbis = admite(xsd, "TotalITBIS") || admite(xsd, "MontoGravadoTotal");
      const enTabla = ECF_TYPE_RULES[tipo]!.itbis;
      expect(enTabla === "forbidden", `${tipo}: XSD ${hayItbis ? "SÍ" : "NO"} tiene ITBIS`).toBe(
        !hayItbis,
      );
    }
  });

  it("las retenciones: prohibidas solo donde el esquema no las tiene", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const xsd = leerXsd(tipo);
      const hay =
        admite(xsd, "TotalITBISRetenido") || admite(xsd, "TotalISRRetencion");
      const enTabla = ECF_TYPE_RULES[tipo]!.retenciones;
      expect(enTabla === "forbidden", `${tipo}: XSD ${hay ? "SÍ" : "NO"} tiene retenciones`).toBe(
        !hay,
      );
    }
  });
});

describe("lo que sabemos de cada tipo, escrito para que no se pierda", () => {
  it("el 43 no tiene comprador: es un gasto propio, no una venta", () => {
    expect(ECF_TYPE_RULES["43"]!.comprador).toBe("forbidden");
    expect(admite(leerXsd("43"), "Comprador")).toBe(false);
  });

  it("el 46 no admite monto exento: en una exportación hay tasa cero", () => {
    expect(ECF_TYPE_RULES["46"]!.montoExento).toBe("forbidden");
    expect(admite(leerXsd("46"), "MontoExento")).toBe(false);
  });

  it("el 46 es el ÚNICO con país del comprador", () => {
    for (const tipo of ALL_ECF_TYPES) {
      const esperado = tipo === "46";
      expect(admite(leerXsd(tipo), "PaisComprador"), tipo).toBe(esperado);
    }
  });

  it("el 44 es exento por definición: sin gravado ni ITBIS", () => {
    expect(ECF_TYPE_RULES["44"]!.itbis).toBe("forbidden");
  });

  it("el 41 sí lleva retención: es su razón de ser", () => {
    expect(ECF_TYPE_RULES["41"]!.retenciones).toBe("optional");
    expect(admite(leerXsd("41"), "TotalITBISRetenido")).toBe(true);
  });

  it("al consumidor final del 32 no se le exige RNC", () => {
    expect(ECF_TYPE_RULES["32"]!.rncComprador).toBe("optional");
  });

  it("las notas 33 y 34 EXIGEN decir qué modifican", () => {
    expect(ECF_TYPE_RULES["33"]!.informacionReferencia).toBe("required");
    expect(ECF_TYPE_RULES["34"]!.informacionReferencia).toBe("required");
  });
});
