import { describe, it, expect, beforeAll } from "vitest";
import forge from "node-forge";
import { runLocalCertTest, LocalCertTestError } from "./local-cert-test";

function genP12(opts?: { expired?: boolean; rnc?: string }) {
  const password = "demo-pass-1234";
  const cn = "DermaLand Local Test Cert";
  const rnc = opts?.rnc ?? "131234567";
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = "0A";
  const now = new Date();
  cert.validity.notBefore = opts?.expired
    ? new Date(now.getFullYear() - 3, 0, 1)
    : new Date(now.getFullYear() - 1, 0, 1);
  cert.validity.notAfter = opts?.expired
    ? new Date(now.getFullYear() - 2, 0, 1)
    : new Date(now.getFullYear() + 2, 0, 1);
  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: cn },
    { name: "organizationName", value: `RNC ${rnc} DermaLand SRL` },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keypair.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keypair.privateKey,
    [cert],
    password,
    { algorithm: "3des" },
  );
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const bytes = forge.util.binary.raw.decode(der);
  return { bytes, password, rnc, cn };
}

let valid: ReturnType<typeof genP12>;
let expired: ReturnType<typeof genP12>;

beforeAll(() => {
  valid = genP12();
  expired = genP12({ expired: true });
});

describe("runLocalCertTest", () => {
  it("ejecuta el flujo completo con un .p12 válido y firma verificada", () => {
    const ev = runLocalCertTest({
      p12Bytes: valid.bytes,
      password: valid.password,
      rncEmisor: valid.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    expect(ev.result).toBe("passed");
    expect(ev.kind).toBe("local-cert-test");
    expect(ev.signatureAlgorithm).toBe("RSA-SHA256");
    expect(ev.steps.find((s) => s.name === "cert_loaded")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "cert_valid")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "xml_signed")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "signature_verified")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "structure_valid")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "qr_generated")?.ok).toBe(true);
    expect(ev.signatureSize).toBeGreaterThan(128); // RSA-2048 → 256 bytes
    expect(ev.xmlSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.signedXmlBase64.length).toBeGreaterThan(100);
  });

  it("el XML firmado contiene la advertencia PRUEBA LOCAL", () => {
    const ev = runLocalCertTest({
      p12Bytes: valid.bytes,
      password: valid.password,
      rncEmisor: valid.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    const xml = Buffer.from(ev.signedXmlBase64, "base64").toString("utf8");
    expect(xml).toContain("PruebaLocal");
    expect(xml).toContain("NO FISCAL");
    expect(xml).toContain("Ambiente>PRUEBA_LOCAL");
  });

  it("el QR payload demo indica NO_FISCAL y testId", () => {
    const ev = runLocalCertTest({
      p12Bytes: valid.bytes,
      password: valid.password,
      rncEmisor: valid.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    expect(ev.qrPayloadDemo).toMatch(/PRUEBA_LOCAL_NO_FISCAL/);
    expect(ev.qrPayloadDemo).toContain(`testId=${ev.testId}`);
  });

  it("cert expirado reporta validity=expired pero igual firma", () => {
    const ev = runLocalCertTest({
      p12Bytes: expired.bytes,
      password: expired.password,
      rncEmisor: expired.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    expect(ev.certificate.validity).toBe("expired");
    expect(ev.steps.find((s) => s.name === "cert_valid")?.ok).toBe(false);
    expect(ev.steps.find((s) => s.name === "xml_signed")?.ok).toBe(true);
    expect(ev.steps.find((s) => s.name === "signature_verified")?.ok).toBe(true);
    // Result global es failed porque cert_valid no pasó.
    expect(ev.result).toBe("failed");
  });

  it("password incorrecta tira LocalCertTestError PARSE_FAILED", () => {
    expect(() =>
      runLocalCertTest({
        p12Bytes: valid.bytes,
        password: "wrong",
        rncEmisor: valid.rnc,
        razonSocialEmisor: "DermaLand SRL",
      }),
    ).toThrow(LocalCertTestError);
  });

  it("evidencia NO incluye password ni private key", () => {
    const ev = runLocalCertTest({
      p12Bytes: valid.bytes,
      password: valid.password,
      rncEmisor: valid.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    const blob = JSON.stringify(ev);
    expect(blob).not.toContain(valid.password);
    expect(blob).not.toMatch(/RSA PRIVATE KEY/i);
    expect(blob).not.toMatch(/BEGIN.*PRIVATE/i);
  });

  it("disclaimer recuerda que no es fiscal", () => {
    const ev = runLocalCertTest({
      p12Bytes: valid.bytes,
      password: valid.password,
      rncEmisor: valid.rnc,
      razonSocialEmisor: "DermaLand SRL",
    });
    expect(ev.disclaimer).toMatch(/[Nn]o.*[Dd][Gg][Ii][Ii]/);
    expect(ev.disclaimer).toMatch(/[Nn]o.*fiscal/i);
  });
});
