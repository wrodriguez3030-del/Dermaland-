// NOTA: este módulo es pure function (no toca filesystem ni red).
// El guard `import "server-only"` se aplica en `service.ts` que orquesta
// el llamado. Mantener este archivo importable desde tests vitest.
//
// Sin embargo, este módulo usa node:crypto vía xml-crypto + xmldom. Bundlear
// hacia cliente fallaría; aún así nunca debe importarse desde un componente
// 'use client'. Si llegase a importarse desde un Server Component que
// renderiza al cliente, hay que envolverlo detrás de un Route Handler / Server
// Action explícito.

import { SignedXml } from "xml-crypto";

/**
 * Firmador XML para e-CF DGII (RD).
 *
 * Implementa **XMLDSig enveloped signature** según el documento adjunto DGII:
 *  - `SignatureMethod`: `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
 *  - `DigestMethod`:    `http://www.w3.org/2001/04/xmlenc#sha256`
 *  - `CanonicalizationMethod`: `http://www.w3.org/TR/2001/REC-xml-c14n-20010315`
 *  - `Reference URI`: vacío (el documento entero es el referenciado).
 *  - `KeyInfo` con `X509Data` → `X509Certificate` (PEM sin headers/footers).
 *  - El `<Signature>` se inserta como ÚLTIMO hijo de `<ECF>` (encaja en el
 *    `xs:any` final del XSD, después de `<FechaHoraFirma>`).
 *
 * No verifica si la firma resultante es XAdES-BES (el doc del cliente
 * menciona XAdES-BES en `docs/dgii-setup.md` pero el documento de
 * requisitos adjunto pide XMLDSig enveloped). Discrepancia anotada como
 * **duda D-11** en `matriz-requisitos-dgii.md` — pendiente validar contra
 * documentación oficial DGII. Si confirman XAdES-BES, añadimos
 * `SignedProperties` (SigningTime, SigningCertificate) en una iteración
 * siguiente.
 *
 * Seguridad:
 *  - Recibe `privateKeyPem` ya descifrado en memoria. NUNCA cachear ni
 *    persistir. El llamador es responsable de obtenerlo desde Vault /
 *    Supabase Storage cifrado + KMS y descartarlo después.
 *  - Recibe `certificatePem` en formato PEM estándar.
 *  - El builder de XML no se vuelve a parsear con DOMParser personalizado;
 *    se pasa como string a `SignedXml.computeSignature`, que internamente
 *    usa `@xmldom/xmldom`.
 *  - Lanza `DgiiSignerError` con mensaje genérico si algo falla, sin
 *    incluir contenido sensible (no se imprime la key, ni el cert, ni el
 *    XML completo en el mensaje).
 *
 * Compatibilidad XSD: usa `isEmptyUri: true` en la Reference. Sin este
 * flag, xml-crypto añade un atributo `Id` al elemento ECF (no permitido
 * por el XSD oficial DGII) para poder referenciarlo con `URI="#id"`.
 * Con `isEmptyUri: true` el output es `URI=""` y el ECF queda intacto —
 * el XML resultante pasa validación contra el XSD oficial.
 */

export class DgiiSignerError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`DgiiSigner: ${message}`);
    this.name = "DgiiSignerError";
    this.cause = cause;
  }
}

export interface SignEcfXmlInput {
  /** XML e-CF sin firmar (output de `buildEcfXml`). */
  xml: string;
  /** Certificado X.509 en PEM (con `BEGIN/END CERTIFICATE`). */
  certificatePem: string;
  /** Llave privada en PEM (descifrada en memoria por el caller). */
  privateKeyPem: string;
}

export interface SignEcfXmlResult {
  /** XML con la firma `<Signature>` enveloped al final del `<ECF>`. */
  xml: string;
  /** Timestamp local del momento de firma (informativo, no DGII). */
  signedAt: string;
}

// Algoritmos requeridos por DGII.
const SIGNATURE_ALGORITHM =
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DIGEST_ALGORITHM = "http://www.w3.org/2001/04/xmlenc#sha256";
const CANONICALIZATION_ALGORITHM =
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const ECF_XPATH = "//*[local-name(.)='ECF']";

/**
 * Limpia un PEM a su contenido base64 (sin headers/footers/saltos).
 * `X509Certificate` dentro de `<KeyInfo>` debe ir sin los marcadores PEM.
 */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

/**
 * Firma un XML e-CF con XMLDSig enveloped.
 *
 * @throws DgiiSignerError si el XML no contiene `<ECF>` o falla la firma.
 */
export function signEcfXml(input: SignEcfXmlInput): SignEcfXmlResult {
  if (!input.xml || !input.xml.includes("<ECF")) {
    throw new DgiiSignerError(
      "XML de entrada inválido: no contiene elemento <ECF>",
    );
  }
  if (!input.certificatePem.includes("BEGIN CERTIFICATE")) {
    throw new DgiiSignerError(
      "certificatePem inválido: no es un PEM con BEGIN CERTIFICATE",
    );
  }
  if (
    !input.privateKeyPem.includes("BEGIN") ||
    !input.privateKeyPem.includes("PRIVATE KEY")
  ) {
    throw new DgiiSignerError(
      "privateKeyPem inválido: se esperaba un PEM con BEGIN ... PRIVATE KEY",
    );
  }

  const certBase64 = pemToBase64(input.certificatePem);

  try {
    const sig = new SignedXml({
      privateKey: input.privateKeyPem,
      publicCert: input.certificatePem,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
      // X509Certificate dentro de KeyInfo, formato DGII.
      getKeyInfoContent: () =>
        `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
    });

    sig.addReference({
      xpath: ECF_XPATH,
      digestAlgorithm: DIGEST_ALGORITHM,
      transforms: [ENVELOPED_TRANSFORM, CANONICALIZATION_ALGORITHM],
      // `isEmptyUri: true` fuerza `URI=""` y evita que xml-crypto añada un
      // `Id` automático al elemento ECF. El XSD oficial DGII NO permite
      // `Id` en ECF — sin este flag la validación XSD rechaza el XML.
      // Documentado en `apps/web/src/server/services/dgii/validator.ts`
      // y en duda D-11 (resuelta con esta opción).
      uri: "",
      isEmptyUri: true,
    });

    sig.computeSignature(input.xml, {
      location: { reference: ECF_XPATH, action: "append" },
    });

    return {
      xml: sig.getSignedXml(),
      signedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof DgiiSignerError) throw err;
    // No exponemos detalles del error de criptografía al consumidor.
    throw new DgiiSignerError("falló la firma XMLDSig del e-CF", err);
  }
}

/**
 * Verifica una firma XMLDSig embebida en un XML e-CF.
 *
 * Útil para tests de roundtrip y para validar respuestas recibidas. NO se
 * usa en el flujo de envío (DGII verifica del lado servidor).
 *
 * @returns true si la firma es matemáticamente válida con el cert dado.
 * @throws DgiiSignerError si el XML no contiene `<Signature>`.
 */
export function verifyEcfSignature(
  signedXml: string,
  certificatePem: string,
): boolean {
  const sigMatch = signedXml.match(
    /<(?:[\w-]+:)?Signature\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?Signature>/,
  );
  if (!sigMatch) {
    throw new DgiiSignerError("XML no contiene elemento <Signature>");
  }

  const verifier = new SignedXml({
    publicCert: certificatePem,
  });
  verifier.loadSignature(sigMatch[0]);
  try {
    // xml-crypto v6: `checkSignature` puede lanzar en vez de retornar false
    // cuando los digests/firmas no cuadran. Normalizamos a boolean.
    return verifier.checkSignature(signedXml);
  } catch {
    return false;
  }
}
