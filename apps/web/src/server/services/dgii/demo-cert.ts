import "server-only";
import forge from "node-forge";

/**
 * DEMOSTRACIÓN ÚNICAMENTE — Certificado dummy en memoria.
 *
 * Genera un cert self-signed RSA al primer uso y lo cachea para el resto del
 * proceso. NUNCA se persiste a disco, NUNCA se commitea, NUNCA reemplaza al
 * certificado DGII real.
 *
 * Uso permitido:
 *  - Demos del pipeline DGII offline (build → sign → validate → PDF).
 *  - Tests de integración en CI/preview.
 *  - Smoke en ambientes de desarrollo.
 *
 * Uso PROHIBIDO:
 *  - Firmar facturas reales que se enviarán a DGII.
 *  - Sustituir el certificado oficial entregado por la cámara de comercio.
 *  - Cualquier flujo que apunte a ambiente `ecf` (producción DGII).
 *
 * Si `dgii_enabled = true` en producción, el flujo real usa
 * `DgiiCertificateService` (Fase C, pendiente) que carga el `.p12` cifrado
 * desde Vault. Este módulo no se invoca en ese flujo.
 */

interface DemoKeyPair {
  certificatePem: string;
  privateKeyPem: string;
  generatedAt: Date;
}

let cached: DemoKeyPair | null = null;

export function getDgiiDemoKeyPair(): DemoKeyPair {
  if (cached) return cached;

  // RSA 2048 (más cercano a producción que 1024). Genera en ~1s en serverless.
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: "DermaLand DGII DEMO (no fiscal)" },
    { name: "countryName", value: "DO" },
    { shortName: "O", value: "DermaLand" },
    { shortName: "OU", value: "DGII demo cert" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  cached = {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    generatedAt: new Date(),
  };
  return cached;
}

/**
 * Solo para tests — fuerza regenerar el cert. NO usar en runtime.
 */
export function _resetDgiiDemoCertForTests(): void {
  cached = null;
}
