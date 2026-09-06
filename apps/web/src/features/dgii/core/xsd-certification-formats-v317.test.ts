// Portada de agendapp: tests/unit/dgii-xsd-certification-formats-v317.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildArecf } from "./builders/arecf";
import { buildAcecf } from "./builders/acecf";
import { buildAnecf } from "./builders/anecf";
import { buildRfce } from "./builders/rfce";
import {
  validateCertificationXml,
  resolveCertificationXsdPath,
  CERTIFICATION_FORMATS,
} from "./certification-xsd";
import { EcfValidatorError } from "./validator-types";
import { rutaPortada } from "./__port__/rutas";

// v317 — XSD OFICIALES de ARECF/ACECF/ANECF/RFCE 32 incorporados y conectados
// a los builders v316. Validación 100% OFFLINE (xmllint-wasm + archivo local).

const XSD_DIR = rutaPortada("docs", "dgii", "xsd");
const FH = "03-07-2026 10:15:00";

const SHA256_OFICIAL: Record<string, string> = {
  "ARECF-v1.0.xsd": "c6d186167159110959eb3f54706ecc7462ad9128fc2c3e03440c8352b1c66f10",
  "ACECF-v1.0.xsd": "072f65de202df8ec136a8d4493e0592172690a4e181047245401cc2e7b23c095",
  "ANECF-v1.0.xsd": "af2e6a16c2900dfa55264d6ebec58ccbbbb25c1eb9821ee18ccc44fc142d0e78",
  "RFCE-32-v1.0.xsd": "6aad535875661b05eef072963295202fc94b3b320b257791feb8d3c39a5f8ee6",
};

describe("v317 — XSD oficiales presentes e íntegros", () => {
  it.each(Object.entries(SHA256_OFICIAL))("%s existe y su SHA256 coincide con la descarga oficial", (file, sha) => {
    const full = resolve(XSD_DIR, file);
    expect(existsSync(full)).toBe(true);
    const content = readFileSync(full);
    expect(createHash("sha256").update(content).digest("hex")).toBe(sha);
    // es un XML Schema real (no HTML de error del portal)
    expect(content.toString("utf8")).toMatch(/<xs:schema/);
  });
  it("allowlist fija: formato desconocido → error controlado (sin path traversal)", () => {
    expect(() => resolveCertificationXsdPath("../../etc/passwd")).toThrow(EcfValidatorError);
    expect(() => resolveCertificationXsdPath("E31")).toThrow(EcfValidatorError);
    for (const f of CERTIFICATION_FORMATS) expect(resolveCertificationXsdPath(f)).toContain(XSD_DIR);
  });
});

describe("v317 — builders v316 PASAN sus XSD oficiales (offline)", () => {
  it("ARECF (Recibido y No Recibido) validan contra ARECF-v1.0.xsd", async () => {
    const ok = buildArecf({ rncEmisor: "131999999", rncComprador: "101000001", encf: "E310000000001", estado: 0, fechaHoraAcuseRecibo: FH });
    expect((await validateCertificationXml("ARECF", ok.xml)).ok).toBe(true);
    const noRecibido = buildArecf({ rncEmisor: "131999999", rncComprador: "101000001", encf: "E310000000001", estado: 1, codigoMotivoNoRecibido: 4, fechaHoraAcuseRecibo: FH });
    expect((await validateCertificationXml("ARECF", noRecibido.xml)).ok).toBe(true);
  });
  it("ACECF (Aceptado y Rechazado) validan contra ACECF-v1.0.xsd", async () => {
    const base = { rncEmisor: "131999999", encf: "E310000000001", fechaEmision: "01-07-2026", montoTotal: 1062, rncComprador: "101000001", fechaHoraAprobacionComercial: FH };
    expect((await validateCertificationXml("ACECF", buildAcecf({ ...base, estado: 1 }).xml)).ok).toBe(true);
    expect((await validateCertificationXml("ACECF", buildAcecf({ ...base, estado: 2, detalleMotivoRechazo: "Monto no coincide" }).xml)).ok).toBe(true);
  });
  it("ANECF (multi-tipo y multi-rango) valida contra ANECF-v1.0.xsd", async () => {
    const { xml } = buildAnecf({
      rncEmisor: "131999999", fechaHoraAnulacion: FH,
      anulaciones: [
        { tipoEcf: "31", rangos: [{ desde: "E310000000001", hasta: "E310000000005" }, { desde: "E310000000009", hasta: "E310000000009" }] },
        { tipoEcf: "32", rangos: [{ desde: "E320000000010", hasta: "E320000000012" }] },
      ],
    });
    expect((await validateCertificationXml("ANECF", xml, { assumeUnsigned: true })).ok).toBe(true);
    // el XSD oficial EXIGE la Signature (xs:any minOccurs=1): sin placeholder falla
    expect((await validateCertificationXml("ANECF", xml)).ok).toBe(false);
    expect(xml).toContain("<Secuencias>"); // wrapper oficial del rango (corregido en v317)
  });
  it("RFCE 32 (con comprador e impuestos adicionales) valida contra RFCE-32-v1.0.xsd", async () => {
    const { xml } = buildRfce({
      encf: "E320000000001", tipoIngresos: "01", tipoPago: 1,
      formasPago: [{ forma: 1, monto: 1000 }, { forma: 3, monto: 239.5 }],
      rncEmisor: "131999999", razonSocialEmisor: "Mi Negocio SRL", fechaEmision: "01-07-2026",
      comprador: { rncComprador: "101000001", razonSocial: "Cliente SRL" },
      totales: {
        montoGravadoTotal: 1000, montoGravadoI1: 1000, totalItbis: 180, totalItbis1: 180,
        montoImpuestoAdicional: 59.5,
        impuestosAdicionales: [{ tipoImpuesto: "019", montoSelectivoEspecifico: 59.5 }],
        montoTotal: 1239.5,
      },
      codigoSeguridad: "aB3dE9",
    });
    expect((await validateCertificationXml("RFCE32", xml, { assumeUnsigned: true })).ok).toBe(true);
  });
});

describe("v317 — payload alterado FALLA el XSD (bloqueo de inválidos)", () => {
  it("elemento fuera de orden / desconocido / valores fuera de rango → invalid con errores", async () => {
    const ok = buildArecf({ rncEmisor: "131999999", rncComprador: "101000001", encf: "E310000000001", estado: 0, fechaHoraAcuseRecibo: FH }).xml;
    const casos = [
      ok.replace("<Estado>0</Estado>", "<Estado>7</Estado>"), // fuera del catálogo 0|1
      ok.replace("<eNCF>", "<Encf>").replace("</eNCF>", "</Encf>"), // elemento desconocido
      ok.replace("<RNCComprador>101000001</RNCComprador>", ""), // obligatorio ausente
    ];
    for (const xml of casos) {
      const r = await validateCertificationXml("ARECF", xml);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it("ANECF con Version inválida y ACECF con Estado=3 fallan", async () => {
    const anecf = buildAnecf({ rncEmisor: "131999999", fechaHoraAnulacion: FH, anulaciones: [{ tipoEcf: "31", rangos: [{ desde: "E310000000001", hasta: "E310000000001" }] }] }).xml;
    expect((await validateCertificationXml("ANECF", anecf.replace("<Version>1.0</Version>", "<Version>9.9</Version>"), { assumeUnsigned: true })).ok).toBe(false);
    const acecf = buildAcecf({ rncEmisor: "131999999", encf: "E310000000001", fechaEmision: "01-07-2026", montoTotal: 10, rncComprador: "101000001", estado: 1, fechaHoraAprobacionComercial: FH }).xml;
    expect((await validateCertificationXml("ACECF", acecf.replace("<Estado>1</Estado>", "<Estado>3</Estado>"))).ok).toBe(false);
  });
});

describe("v317 — invariantes de seguridad", () => {
  it("sin red en runtime: el validador solo lee disco local (sin fetch/URLs externas)", () => {
    const src = readFileSync(rutaPortada("src/lib/dgii/certification-xsd.ts"), "utf8");
    expect(src).not.toMatch(/fetch\(|axios|XMLHttpRequest|https?:\/\/(?!www\.w3\.org|dgii\.gov\.do)/); // w3.org = namespace XML, no red
    expect(src).toMatch(/node:fs\/promises/);
  });
  it("sin DGII real / EI / DS / secuencias / certificados en lo agregado", () => {
    const src = readFileSync(rutaPortada("src/lib/dgii/certification-xsd.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/dgii_enabled_real_send|electronicInvoice|dgiiSubmission|ecfSequence|next_number|certificate-storage/i);
  });
});
