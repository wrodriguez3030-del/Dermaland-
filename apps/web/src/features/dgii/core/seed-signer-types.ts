/**
 * Tipos de la firma XMLDSig de la Semilla DGII (Fase G2A).
 * La semilla firmada SOLO se usa para ValidarSemilla; nunca se expone al cliente/UI.
 */

export type SignDgiiSeedXmlInput = {
  seedXml: string;
  certificatePem: string;
  privateKeyPem: string;
};

export type SignDgiiSeedXmlResult = {
  signedSeedXml: string;
  certificateFingerprintSha256: string;
  signatureAlgorithm: string;
  digestAlgorithm: string;
  canonicalizationAlgorithm: string;
  warnings: string[];
};

export type VerifyDgiiSeedSignatureInput = {
  signedSeedXml: string;
  /** Opcional: si falta, se extrae el X509Certificate embebido. */
  certificatePem?: string;
};

export type VerifyDgiiSeedSignatureResult = {
  ok: boolean;
  errors: string[];
  certificateFingerprintSha256?: string;
};

export class SeedSignerInvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedSignerInvalidInput";
  }
}

export class SeedSignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedSignerError";
  }
}
