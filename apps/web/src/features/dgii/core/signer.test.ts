// Portada de agendapp: tests/unit/dgii-signer.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { signEcfXml, verifyEcfSignature, extractCertificateInfo } from "./signer";
import { EcfSignerInvalidInput } from "./signer-types";
import { buildEcfXml } from "./builder";
import type { BuildEcfXmlInput, EcfTipoBuilder } from "./builder-types";
import { validateEcfXml } from "./validator";
import { loadXsdForTipo } from "./xsd-loader";
import { getDummyCert, getExpiredDummyCert } from "./__port__/dgii-test-cert";

const { certificatePem, privateKeyPem } = getDummyCert();

function inputFor(t: EcfTipoBuilder): BuildEcfXmlInput {
  const base: BuildEcfXmlInput = {
    tipoEcf: t,
    eNcf: `E${t}0000000001`,
    fechaEmision: "2026-06-09T10:00:00.000Z",
    ambiente: "testecf",
    emisor: { rnc: "130123456", razonSocial: "Mi Negocio SRL", direccion: "Calle 1, Santiago", telefono: "809-555-1212", correo: "emisor@ejemplo.do" },
    comprador: { rncOCedula: "131245678", razonSocial: "Cliente SA" },
    items: [
      { nombre: "Servicio A", cantidad: 1, precioUnitario: 100, itbisRate: 18, indicadorBienoServicio: "2" },
      { nombre: "Producto B", cantidad: 2, precioUnitario: 50, itbisRate: 0, indicadorBienoServicio: "1" },
    ],
  };
  if (t === "31" || t === "33") base.fechaVencimientoSecuencia = "2026-12-31T00:00:00Z";
  if (t === "33" || t === "34") base.referencia = { ncfModificado: "E310000000009", fechaNcfModificado: "2026-05-01T00:00:00Z", codigoModificacion: "1" };
  return base;
}

function sign(t: EcfTipoBuilder) {
  const { xml } = buildEcfXml(inputFor(t));
  return signEcfXml({ xml, certificatePem, privateKeyPem });
}

describe("signEcfXml — firma básica", () => {
  it("firma tipo 32 y verify retorna true", () => {
    const { signedXml } = sign("32");
    expect(verifyEcfSignature({ signedXml, certificatePem }).ok).toBe(true);
  });

  it("usa RSA-SHA256, SHA256 digest, c14n 2001/03/15 y Reference URI=\"\"", () => {
    const { signedXml, signatureAlgorithm, digestAlgorithm, canonicalizationAlgorithm } = sign("32");
    expect(signatureAlgorithm).toContain("rsa-sha256");
    expect(digestAlgorithm).toContain("xmlenc#sha256");
    expect(canonicalizationAlgorithm).toContain("REC-xml-c14n-20010315");
    expect(signedXml).toContain("xmldsig-more#rsa-sha256");
    expect(signedXml).toContain("xmlenc#sha256");
    expect(signedXml).toContain("REC-xml-c14n-20010315");
    expect(signedXml).toContain('URI=""');
  });

  it("Signature es el último hijo de ECF", () => {
    const { signedXml } = sign("32");
    expect(/<\/(?:\w+:)?Signature>\s*<\/(?:\w+:)?ECF>\s*$/.test(signedXml.trim())).toBe(true);
  });

  it("KeyInfo con X509Certificate sin headers PEM", () => {
    const { signedXml } = sign("32");
    expect(signedXml).toContain("X509Certificate");
    expect(signedXml).not.toContain("BEGIN CERTIFICATE");
  });

  it("no agrega Id al root ECF", () => {
    const { signedXml } = sign("32");
    expect(/<(?:\w+:)?ECF\s+Id=/.test(signedXml)).toBe(false);
  });

  it("salida sin BOM y sin undefined/null", () => {
    const { signedXml } = sign("32");
    expect(signedXml.charCodeAt(0)).not.toBe(0xfeff);
    expect(signedXml).not.toContain("undefined");
    expect(signedXml).not.toContain(">null<");
  });

  it("fingerprint coincide con extractCertificateInfo", () => {
    const r = sign("32");
    expect(r.certificateFingerprintSha256).toBe(extractCertificateInfo(certificatePem).fingerprintSha256);
  });
});

describe("signEcfXml — flujo build → sign → verify → XSD oficial (31/32/33/34)", () => {
  for (const t of ["31", "32", "33", "34"] as EcfTipoBuilder[]) {
    it(`tipo ${t}: firma + verify + pasa XSD oficial (sin placeholder)`, async () => {
      const { signedXml } = sign(t);
      expect(verifyEcfSignature({ signedXml, certificatePem }).ok).toBe(true);
      const xsd = await loadXsdForTipo(t);
      const res = await validateEcfXml({ xml: signedXml, xsd, schemaName: `e-CF-${t}` });
      if (!res.ok) console.error(`XSD ${t} (firmado) errores:`, res.errors.slice(0, 8));
      expect(res.ok).toBe(true);
    });
  }
});

describe("signEcfXml — placeholder y duplicados", () => {
  it("remueve placeholder <Signature> de Fase 5 antes de firmar", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    const withPlaceholder = xml.replace(/<\/ECF>\s*$/, '  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"></Signature>\n</ECF>');
    const { signedXml } = signEcfXml({ xml: withPlaceholder, certificatePem, privateKeyPem });
    // Una sola firma (la real), y verify ok.
    expect((signedXml.match(/<(?:\w+:)?Signature\b/g) ?? []).length).toBe(1);
    expect(verifyEcfSignature({ signedXml, certificatePem }).ok).toBe(true);
  });

  it("rechaza si ya hay una firma real (no placeholder)", () => {
    const { signedXml } = sign("32");
    expect(() => signEcfXml({ xml: signedXml, certificatePem, privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
});

describe("signEcfXml — validaciones de entrada", () => {
  it("rechaza XML vacío", () => {
    expect(() => signEcfXml({ xml: "", certificatePem, privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
  it("rechaza XML sin <ECF>", () => {
    expect(() => signEcfXml({ xml: "<Otro></Otro>", certificatePem, privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
  it("rechaza XML con BOM", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    expect(() => signEcfXml({ xml: "﻿" + xml, certificatePem, privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
  it("rechaza certificado inválido", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    expect(() => signEcfXml({ xml, certificatePem: "no-es-cert", privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
  it("rechaza private key inválida", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    expect(() => signEcfXml({ xml, certificatePem, privateKeyPem: "no-es-key" })).toThrow(EcfSignerInvalidInput);
  });
  it("rechaza certificado vencido", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    const exp = getExpiredDummyCert();
    expect(() => signEcfXml({ xml, certificatePem: exp.certificatePem, privateKeyPem: exp.privateKeyPem })).toThrow(EcfSignerInvalidInput);
  });
  it("los errores NO filtran private key ni certificado completo", () => {
    const { xml } = buildEcfXml(inputFor("32"));
    try {
      signEcfXml({ xml, certificatePem, privateKeyPem: "no-es-key" });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("PRIVATE KEY");
      expect(msg).not.toContain(privateKeyPem.slice(40, 80));
    }
  });
});

describe("verifyEcfSignature — detección de manipulación", () => {
  it("falla si se altera un monto después de firmar", () => {
    const { signedXml } = sign("32");
    const tampered = signedXml.replace(/<MontoTotal>[\d.]+<\/MontoTotal>/, "<MontoTotal>1.00</MontoTotal>");
    expect(tampered).not.toBe(signedXml);
    expect(verifyEcfSignature({ signedXml: tampered, certificatePem }).ok).toBe(false);
  });
  it("falla si se altera un item después de firmar", () => {
    const { signedXml } = sign("32");
    const tampered = signedXml.replace("Servicio A", "Servicio HACKEADO");
    expect(verifyEcfSignature({ signedXml: tampered, certificatePem }).ok).toBe(false);
  });
  it("falla si se quita la Signature", () => {
    const { signedXml } = sign("32");
    const noSig = signedXml.replace(/<(?:\w+:)?Signature[\s\S]*?<\/(?:\w+:)?Signature>/, "");
    const r = verifyEcfSignature({ signedXml: noSig, certificatePem });
    expect(r.ok).toBe(false);
  });
  it("verify usa el cert embebido si no se pasa certificatePem", () => {
    const { signedXml } = sign("32");
    expect(verifyEcfSignature({ signedXml }).ok).toBe(true);
  });
});

describe("signEcfXml — pureza", () => {
  it("no llama fetch", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    sign("32");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// 50+ casos: firma+verify para combinaciones de tipo/rate/cantidad/precio.
describe("signEcfXml — matriz firma+verify", () => {
  const tipos = ["31", "32", "33", "34"] as EcfTipoBuilder[];
  const rates = [0, 16, 18];
  const precios = [10.5, 99.99, 1234.56, 0];
  let count = 0;
  for (const t of tipos) {
    for (const rate of rates) {
      for (const precio of precios) {
        count++;
        it(`caso #${count}: ${t}/${rate}/${precio} firma y verifica`, () => {
          const base = inputFor(t);
          base.items = [{ nombre: "Item & <x>", cantidad: 2, precioUnitario: precio, itbisRate: rate, indicadorBienoServicio: "1" }];
          const { xml } = buildEcfXml(base);
          const { signedXml } = signEcfXml({ xml, certificatePem, privateKeyPem });
          expect(verifyEcfSignature({ signedXml, certificatePem }).ok).toBe(true);
        });
      }
    }
  }
  // 4 * 3 * 4 = 48 + casos sueltos arriba → 50+
});
