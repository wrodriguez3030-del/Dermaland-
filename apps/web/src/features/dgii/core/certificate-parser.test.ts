// Portada de agendapp: tests/unit/dgii-certificate-parser.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parsePkcs12Certificate, EcfCertificateParseError } from "./certificate-parser";
import { makeDummyPkcs12 } from "./__port__/dgii-test-cert";

const dummy = makeDummyPkcs12("clave-dummy-9999");

describe("parsePkcs12Certificate", () => {
  it("parsea un .p12 dummy con la contraseña correcta", () => {
    const r = parsePkcs12Certificate({ pkcs12Bytes: dummy.pkcs12Bytes, password: dummy.password });
    expect(r.certificatePem).toContain("BEGIN CERTIFICATE");
    expect(r.privateKeyPem).toContain("PRIVATE KEY");
    expect(r.expired).toBe(false);
  });

  it("extrae subject/issuer/serial/validity/fingerprint", () => {
    const r = parsePkcs12Certificate({ pkcs12Bytes: dummy.pkcs12Bytes, password: dummy.password });
    expect(r.metadata.subject).toContain("DUMMY ECF TEST");
    expect(r.metadata.serialNumber.length).toBeGreaterThan(0);
    expect(r.metadata.fingerprintSha256).toBe(dummy.fingerprintSha256);
    expect(new Date(r.metadata.validTo).getUTCFullYear()).toBe(2035);
  });

  it("rechaza password incorrecta", () => {
    expect(() => parsePkcs12Certificate({ pkcs12Bytes: dummy.pkcs12Bytes, password: "incorrecta" }))
      .toThrow(EcfCertificateParseError);
  });

  it("rechaza archivo corrupto", () => {
    expect(() => parsePkcs12Certificate({ pkcs12Bytes: new Uint8Array([1, 2, 3, 4, 5]), password: dummy.password }))
      .toThrow(EcfCertificateParseError);
  });

  it("rechaza entrada vacía", () => {
    expect(() => parsePkcs12Certificate({ pkcs12Bytes: new Uint8Array(0), password: "x" }))
      .toThrow(EcfCertificateParseError);
  });

  it("detecta certificado vencido", () => {
    const exp = makeDummyPkcs12("p", true);
    const r = parsePkcs12Certificate({ pkcs12Bytes: exp.pkcs12Bytes, password: exp.password });
    expect(r.expired).toBe(true);
  });

  it("los errores no filtran la password", () => {
    try {
      parsePkcs12Certificate({ pkcs12Bytes: dummy.pkcs12Bytes, password: "super-secreta-1234" });
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secreta-1234");
    }
  });
});
