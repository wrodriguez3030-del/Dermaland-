// Portada de agendapp: tests/unit/dgii-seed-signer.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { signDgiiSeedXml, verifyDgiiSeedSignature } from "./seed-signer";
import { SeedSignerInvalidInput } from "./seed-signer-types";
import { getDummyCert, getExpiredDummyCert } from "./__port__/dgii-test-cert";

const SEED = `<?xml version="1.0" encoding="UTF-8"?>\n<SemillaModel><valor>SEED-123</valor><fecha>2026-06-10T00:00:00Z</fecha></SemillaModel>`;

describe("signDgiiSeedXml", () => {
  it("firma una semilla dummy con certificado dummy (XMLDSig RSA-SHA256)", () => {
    const dummy = getDummyCert();
    const r = signDgiiSeedXml({ seedXml: SEED, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem });
    expect(r.signedSeedXml).toContain("Signature");
    expect(r.signatureAlgorithm).toContain("rsa-sha256");
    expect(r.digestAlgorithm).toContain("sha256");
    expect(r.canonicalizationAlgorithm).toContain("xml-c14n-20010315");
    expect(r.certificateFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("KeyInfo contiene X509Certificate sin headers PEM", () => {
    const dummy = getDummyCert();
    const r = signDgiiSeedXml({ seedXml: SEED, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem });
    expect(r.signedSeedXml).toContain("X509Certificate");
    expect(r.signedSeedXml).not.toContain("BEGIN CERTIFICATE");
  });

  it("no expone la private key en el resultado", () => {
    const dummy = getDummyCert();
    const r = signDgiiSeedXml({ seedXml: SEED, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem });
    expect(JSON.stringify(r)).not.toContain("PRIVATE KEY");
  });

  it("semilla vacía o malformada falla con error controlado", () => {
    const dummy = getDummyCert();
    expect(() => signDgiiSeedXml({ seedXml: "", certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem })).toThrow(SeedSignerInvalidInput);
    expect(() => signDgiiSeedXml({ seedXml: "<<<no-xml", certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem })).toThrow(SeedSignerInvalidInput);
  });

  it("certificado vencido falla", () => {
    const exp = getExpiredDummyCert();
    expect(() => signDgiiSeedXml({ seedXml: SEED, certificatePem: exp.certificatePem, privateKeyPem: exp.privateKeyPem })).toThrow(/vencido/i);
  });
});

describe("verifyDgiiSeedSignature", () => {
  it("verifica una semilla firmada (cert embebido) → ok", () => {
    const dummy = getDummyCert();
    const { signedSeedXml } = signDgiiSeedXml({ seedXml: SEED, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem });
    const v = verifyDgiiSeedSignature({ signedSeedXml });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("falla si se altera la semilla firmada", () => {
    const dummy = getDummyCert();
    const { signedSeedXml } = signDgiiSeedXml({ seedXml: SEED, certificatePem: dummy.certificatePem, privateKeyPem: dummy.privateKeyPem });
    const tampered = signedSeedXml.replace("SEED-123", "SEED-999");
    expect(verifyDgiiSeedSignature({ signedSeedXml: tampered }).ok).toBe(false);
  });

  it("falla si no hay firma", () => {
    expect(verifyDgiiSeedSignature({ signedSeedXml: SEED }).ok).toBe(false);
  });
});
