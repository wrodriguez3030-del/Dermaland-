// Portada de agendapp: tests/unit/dgii-validator.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { validateEcfXml } from "./validator";
import { EcfValidatorError, MAX_XML_BYTES } from "./validator-types";

// ──────────────────────────────────────────────────────────────────────────
// FIXTURE TÉCNICO — NO es un XSD de DGII. Solo prueba el wrapper del validador.
// ──────────────────────────────────────────────────────────────────────────
const FIXTURE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="A" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<Root><A>hola</A></Root>`;
const INVALID_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<Root><B>nope</B></Root>`;

describe("validateEcfXml (fixture técnico, no DGII)", () => {
  it("ok=true para XML válido contra el XSD fixture", async () => {
    const r = await validateEcfXml({ xml: VALID_XML, xsd: FIXTURE_XSD, schemaName: "fixture" });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.schemaName).toBe("fixture");
  });

  it("ok=false para XML inválido", async () => {
    const r = await validateEcfXml({ xml: INVALID_XML, xsd: FIXTURE_XSD });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("los errores NO incluyen el XML completo", async () => {
    const r = await validateEcfXml({ xml: INVALID_XML, xsd: FIXTURE_XSD });
    for (const e of r.errors) {
      expect(e.message.includes(INVALID_XML)).toBe(false);
    }
  });

  it("lanza EcfValidatorError si el XML está vacío", async () => {
    await expect(validateEcfXml({ xml: "", xsd: FIXTURE_XSD })).rejects.toBeInstanceOf(EcfValidatorError);
  });

  it("lanza EcfValidatorError si el XSD está vacío", async () => {
    await expect(validateEcfXml({ xml: VALID_XML, xsd: "" })).rejects.toBeInstanceOf(EcfValidatorError);
  });

  it("rechaza XML demasiado grande", async () => {
    const huge = `<Root><A>${"x".repeat(MAX_XML_BYTES + 10)}</A></Root>`;
    await expect(validateEcfXml({ xml: huge, xsd: FIXTURE_XSD })).rejects.toBeInstanceOf(EcfValidatorError);
  });

  it("no llama fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await validateEcfXml({ xml: VALID_XML, xsd: FIXTURE_XSD });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// VALIDACIÓN OFICIAL contra los XSD reales de DGII (docs/dgii/xsd/).
// El XSD exige un <Signature> final (xs:any minOccurs=1, processContents=skip).
// Como Fase 5 NO firma, el test agrega un <Signature> PLACEHOLDER (solo para
// satisfacer ese nodo "any"); la firma real es Fase 6. Así se prueba que la
// ESTRUCTURA del builder es XSD-válida.
// ──────────────────────────────────────────────────────────────────────────
import { buildEcfXml } from "./builder";
import { loadXsdForTipo } from "./xsd-loader";
import type { BuildEcfXmlInput, EcfTipoBuilder } from "./builder-types";

/** Inserta un <Signature> placeholder antes de </ECF> (xs:any skip lo acepta). */
function withSignaturePlaceholder(xml: string): string {
  return xml.replace(
    /<\/ECF>\s*$/,
    '  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"></Signature>\n</ECF>',
  );
}

function inputFor(t: EcfTipoBuilder): BuildEcfXmlInput {
  const encf = `E${t}0000000001`;
  const base: BuildEcfXmlInput = {
    tipoEcf: t,
    eNcf: encf,
    fechaEmision: "2026-06-09T10:00:00.000Z",
    ambiente: "testecf",
    emisor: { rnc: "130123456", razonSocial: "Mi Negocio SRL", direccion: "Calle 1, Santiago", telefono: "809-555-1212", correo: "emisor@ejemplo.do" },
    comprador: { rncOCedula: "131245678", razonSocial: "Cliente SA" },
    items: [
      { nombre: "Servicio A", cantidad: 1, precioUnitario: 100, itbisRate: 18, indicadorBienoServicio: "2" },
      { nombre: "Producto B", cantidad: 2, precioUnitario: 50, itbisRate: 0, indicadorBienoServicio: "1" },
    ],
  };
  if (t === "31" || t === "33") {
    base.fechaVencimientoSecuencia = "2026-12-31T00:00:00Z";
  }
  if (t === "33" || t === "34") {
    base.referencia = { ncfModificado: "E310000000009", fechaNcfModificado: "2026-05-01T00:00:00Z", codigoModificacion: "1" };
  }
  return base;
}

describe("builder vs XSD oficial DGII (v1.0)", () => {
  for (const t of ["31", "32", "33", "34"] as EcfTipoBuilder[]) {
    it(`tipo ${t}: el XML (con Signature placeholder) pasa el XSD oficial`, async () => {
      const { xml } = buildEcfXml(inputFor(t));
      const xsd = await loadXsdForTipo(t);
      const res = await validateEcfXml({ xml: withSignaturePlaceholder(xml), xsd, schemaName: `e-CF-${t}` });
      if (!res.ok) console.error(`XSD ${t} errores:`, res.errors.slice(0, 8));
      expect(res.ok).toBe(true);
    });
  }

  it("el XML SIN firma falla el XSD solo por el <Signature> requerido (Fase 6)", async () => {
    const { xml } = buildEcfXml(inputFor("32"));
    const xsd = await loadXsdForTipo("32");
    const res = await validateEcfXml({ xml, xsd, schemaName: "e-CF-32" });
    expect(res.ok).toBe(false);
    // El/los error(es) deben referirse al contenido faltante tras FechaHoraFirma (la firma).
    const blob = res.errors.map((e) => e.message).join(" ").toLowerCase();
    expect(blob.length).toBeGreaterThan(0);
  });
});
