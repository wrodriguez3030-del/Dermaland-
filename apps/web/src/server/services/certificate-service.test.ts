import { describe, it, expect, beforeAll } from "vitest";
import forge from "node-forge";
import {
  CertificateServiceError,
  buildAlias,
  parsePkcs12,
} from "./certificate-service";

interface Generated {
  p12: Uint8Array;
  password: string;
  cnSubject: string;
  rnc: string;
  notBefore: Date;
  notAfter: Date;
}

function generateP12(opts?: {
  password?: string;
  cn?: string;
  rnc?: string;
  expired?: boolean;
}): Generated {
  const password = opts?.password ?? "demo-password-1234";
  const cn = opts?.cn ?? "DermaLand Test Cert";
  const rnc = opts?.rnc ?? "131234567";
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = "01ABCDEF";
  const now = new Date();
  const notBefore = opts?.expired
    ? new Date(now.getFullYear() - 3, 0, 1)
    : new Date(now.getFullYear() - 1, 0, 1);
  const notAfter = opts?.expired
    ? new Date(now.getFullYear() - 2, 0, 1)
    : new Date(now.getFullYear() + 2, 0, 1);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;
  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: cn },
    { name: "organizationName", value: `RNC ${rnc} DermaLand SRL` },
    { name: "countryName", value: "DO" },
    { name: "serialName" as never, value: rnc, type: "2.5.4.5", shortName: "serialNumber" },
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
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const buf = forge.util.binary.raw.decode(p12Der);
  return {
    p12: buf,
    password,
    cnSubject: cn,
    rnc,
    notBefore,
    notAfter,
  };
}

let valid: Generated;
let expired: Generated;

beforeAll(() => {
  valid = generateP12({ cn: "DermaLand Demo Cert", rnc: "131234567" });
  expired = generateP12({ expired: true, cn: "Expired Cert" });
});

describe("certificate-service.parsePkcs12", () => {
  it("parsea un .p12 válido y extrae metadata", () => {
    const { metadata } = parsePkcs12(valid.p12, valid.password);
    expect(metadata.subjectDn).toMatch(/CN=DermaLand Demo Cert/);
    expect(metadata.issuerDn).toMatch(/CN=DermaLand Demo Cert/); // self-signed en el test
    expect(metadata.serialNumber).toMatch(/^[0-9A-F]+$/);
    expect(metadata.fingerprintSha256).toMatch(/^[0-9A-F:]+$/);
    expect(metadata.fingerprintSha256.length).toBeGreaterThan(60);
    expect(metadata.fingerprintSha256Short).toMatch(/^[0-9A-F]{8}…[0-9A-F]{8}$/);
    expect(metadata.validity).toBe("valid");
    expect(metadata.hasPrivateKey).toBe(true);
    expect(metadata.rncEmisor).toBe("131234567");
    expect(new Date(metadata.validFrom).getTime()).toBeLessThan(Date.now());
    expect(new Date(metadata.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  it("devuelve PEM del certificado (sin clave privada)", () => {
    const { pemCertificate } = parsePkcs12(valid.p12, valid.password);
    expect(pemCertificate).toMatch(/^-----BEGIN CERTIFICATE-----/);
    expect(pemCertificate).toMatch(/-----END CERTIFICATE-----\s*$/);
    expect(pemCertificate).not.toMatch(/PRIVATE KEY/);
  });

  it("rechaza contraseña incorrecta con WRONG_PASSWORD", () => {
    try {
      parsePkcs12(valid.p12, "incorrect-password");
      throw new Error("debería haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(CertificateServiceError);
      expect((err as CertificateServiceError).code).toBe("WRONG_PASSWORD");
    }
  });

  it("rechaza bytes no-PKCS12 con INVALID_PKCS12", () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    try {
      parsePkcs12(garbage, "x");
      throw new Error("debería haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(CertificateServiceError);
      expect((err as CertificateServiceError).code).toBe("INVALID_PKCS12");
    }
  });

  it("certificado vencido reporta validity='expired'", () => {
    const { metadata } = parsePkcs12(expired.p12, expired.password);
    expect(metadata.validity).toBe("expired");
  });

  it("buildAlias extrae el CN del subject", () => {
    const { metadata } = parsePkcs12(valid.p12, valid.password);
    expect(buildAlias(metadata)).toBe("DermaLand Demo Cert");
  });

  it("la metadata NO incluye la contraseña ni la clave privada", () => {
    const { metadata, pemCertificate } = parsePkcs12(valid.p12, valid.password);
    const blob = JSON.stringify(metadata) + "\n" + pemCertificate;
    expect(blob).not.toContain(valid.password);
    expect(blob).not.toMatch(/PRIVATE KEY/i);
  });
});
