/**
 * Tipos de la firma XMLDSig e-CF (Fase 6). Local, sin DGII, sin certificados
 * reales (cert dummy en tests). Sin secretos persistidos.
 */

/** Algoritmos DGII (XMLDSig enveloped, RSA-SHA256, c14n 2001/03/15, SHA256). */
export const SIGNATURE_ALGORITHM = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
export const DIGEST_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#sha256";
export const CANONICALIZATION_ALGORITHM = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
export const ENVELOPED_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export type SignEcfXmlOptions = {
  /** Incluir <KeyInfo><X509Data><X509Certificate>… (default true). */
  includeKeyInfo?: boolean;
  /** Id opcional del elemento <Signature> (no se agrega Id al root ECF). */
  signatureId?: string;
  /** Validar estructura básica del XML antes de firmar (default true). */
  validateBeforeSign?: boolean;
};

export type SignEcfXmlInput = {
  xml: string;
  certificatePem: string;
  privateKeyPem: string;
  options?: SignEcfXmlOptions;
};

export type SignEcfXmlResult = {
  signedXml: string;
  certificateFingerprintSha256: string;
  signatureAlgorithm: string;
  digestAlgorithm: string;
  canonicalizationAlgorithm: string;
  warnings: string[];
};

export type VerifyEcfSignatureInput = {
  signedXml: string;
  /** Si se omite, se usa el certificado embebido en KeyInfo del XML. */
  certificatePem?: string;
};

export type VerifyEcfSignatureResult = {
  ok: boolean;
  errors: string[];
  certificateFingerprintSha256?: string;
};

export type CertificateInfo = {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprintSha256: string;
};

/** Entrada inválida (XML/PEM vacío o mal formado). NUNCA incluye material sensible. */
export class EcfSignerInvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfSignerInvalidInput";
  }
}

/** Error durante el proceso de firma. */
export class EcfSignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfSignerError";
  }
}

/** Error de verificación de firma. */
export class EcfSignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfSignatureVerificationError";
  }
}
