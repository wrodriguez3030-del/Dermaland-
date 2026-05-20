import "server-only";
import forge from "node-forge";
import { parsePkcs12 } from "./certificate-service";
import { buildEcfXml, EcfBuilderInvalidInput } from "./dgii/builder";
import { signEcfXml } from "./dgii/signer";
import { validateEcfXml } from "./dgii/validator";
import type { EcfBuilderInput } from "./dgii/types";

/**
 * Prueba local del certificado (NO envía nada a DGII).
 *
 * El flujo:
 *  1. Re-parsea el `.p12` con la password para obtener cert + clave
 *     privada en memoria.
 *  2. Genera un XML demo (e-CF tipo 32 simplificado) con datos de
 *     "Prueba local. No fiscal".
 *  3. Calcula SHA-256 del XML.
 *  4. Firma el digest con RSA-SHA256 usando la clave privada.
 *  5. Embebe `<Signature>` (XAdES-BES simplificado) con
 *     `SignatureValue` y el certificado X.509 PEM.
 *  6. Re-verifica la firma con la clave pública del cert para
 *     confirmar consistencia.
 *  7. Valida estructura mínima del XML firmado (well-formed +
 *     elementos obligatorios).
 *  8. Genera un payload de QR mock con campos del e-CF.
 *  9. (opcional, si el caller pasa `xsdContent`) Construye un e-CF
 *     tipo 32 REAL con `buildEcfXml`, lo firma con `signEcfXml`
 *     (XMLDSig enveloped) y lo valida contra el XSD oficial DGII vía
 *     `validateEcfXml` (xmllint-wasm). Este paso prueba que el
 *     certificado puede producir XML que pasa el schema oficial,
 *     sin enviar a DGII.
 * 10. Devuelve evidencia. NUNCA expone la clave privada ni la
 *     contraseña.
 *
 * El XML firmado y el cert PEM son información que iría dentro del
 * documento e-CF si se enviara — son seguros de devolver al cliente
 * para mostrar evidencia. La clave privada NUNCA sale del server.
 */

export interface LocalTestEvidence {
  /** Sello de origen. */
  kind: "local-cert-test";
  /** Timestamp ISO de la ejecución. */
  executedAt: string;
  /** Identificador único de la prueba (UUID). */
  testId: string;

  /** Resultado global. */
  result: "passed" | "failed";
  /** Mensaje legible para UI. */
  resultMessage: string;

  /** Pasos individuales con estado verificable. */
  steps: {
    name:
      | "cert_loaded"
      | "cert_valid"
      | "xml_built"
      | "xml_signed"
      | "signature_verified"
      | "structure_valid"
      | "qr_generated"
      | "xsd_valid";
    ok: boolean;
    detail?: string;
  }[];

  /** Metadata del certificado usada. */
  certificate: {
    subjectDn: string;
    issuerDn: string;
    fingerprintSha256Short: string;
    validity: "valid" | "expired" | "invalid";
    rncEmisor?: string;
  };

  /** XML demo firmado en base64 (es público; el e-CF entero va firmado). */
  signedXmlBase64: string;
  /** Hash SHA-256 del XML antes de firmar (hex). */
  xmlSha256: string;
  /** Algoritmo usado. */
  signatureAlgorithm: "RSA-SHA256";
  /** Tamaño del SignatureValue en bytes (información, no la firma). */
  signatureSize: number;

  /** Payload del QR demo (string para que la UI genere el QR). */
  qrPayloadDemo: string;

  /** Sello legal/operativo recordatorio. */
  disclaimer: string;
}

interface CertMaterial {
  cert: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  pem: string;
}

function buildXmlDemo(args: {
  rnc: string;
  razonSocial: string;
  testId: string;
}): string {
  // e-CF tipo 32 (Consumo) simplificado. Bandera "PRUEBA LOCAL".
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>32</TipoeCF>
      <eNCF>E320000000DEMO</eNCF>
      <FechaVencimientoSecuencia>2027-12-31</FechaVencimientoSecuencia>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${args.rnc}</RNCEmisor>
      <RazonSocialEmisor>${args.razonSocial}</RazonSocialEmisor>
      <FechaEmision>${today}</FechaEmision>
      <Ambiente>PRUEBA_LOCAL</Ambiente>
    </Emisor>
    <Comprador>
      <RNCComprador>000000000</RNCComprador>
      <RazonSocialComprador>Cliente DEMO (Prueba local)</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoGravadoTotal>100.00</MontoGravadoTotal>
      <TotalITBIS>18.00</TotalITBIS>
      <MontoTotal>118.00</MontoTotal>
    </Totales>
  </Encabezado>
  <Detalle>
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <Descripcion>Producto demo prueba local certificado</Descripcion>
      <Cantidad>1</Cantidad>
      <PrecioUnitario>100.00</PrecioUnitario>
      <MontoLinea>100.00</MontoLinea>
    </Item>
  </Detalle>
  <PruebaLocal>
    <Aviso>NO FISCAL. NO ENVIADO A DGII. SOLO VALIDACION DE FIRMA LOCAL.</Aviso>
    <TestId>${args.testId}</TestId>
  </PruebaLocal>
</ECF>`;
}

function sha256Hex(input: string): string {
  const md = forge.md.sha256.create();
  md.update(input, "utf8");
  return md.digest().toHex();
}

function loadCertMaterial(p12Bytes: Uint8Array, password: string): CertMaterial {
  const { metadata: _meta, pemCertificate } = parsePkcs12(p12Bytes, password);
  // Re-parse para extraer la clave privada de forma robusta.
  const binary = forge.util.binary.raw.encode(p12Bytes);
  const asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const keyBags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag as string,
  });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag as string });
  const privateKey =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag as string]?.[0]?.key;
  const cert = certBags[forge.pki.oids.certBag as string]?.[0]?.cert;
  if (!privateKey || !cert) {
    throw new Error("No pude extraer key+cert del PKCS#12.");
  }
  return { cert, privateKey, pem: pemCertificate };
}

function signXmlDigest(xml: string, privateKey: forge.pki.PrivateKey): {
  signatureBase64: string;
  signatureBytes: number;
} {
  const md = forge.md.sha256.create();
  md.update(xml, "utf8");
  // forge.pki.PrivateKey en formato RSA expone `.sign(md)`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signed = (privateKey as any).sign(md);
  const base64 = forge.util.encode64(signed);
  return { signatureBase64: base64, signatureBytes: signed.length };
}

function verifyXmlSignature(
  xml: string,
  signatureBase64: string,
  cert: forge.pki.Certificate,
): boolean {
  try {
    const md = forge.md.sha256.create();
    md.update(xml, "utf8");
    const sigBytes = forge.util.decode64(signatureBase64);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cert.publicKey as any).verify(md.digest().bytes(), sigBytes);
  } catch {
    return false;
  }
}

function embedSignatureInXml(args: {
  xml: string;
  signatureBase64: string;
  certPem: string;
}): string {
  // Estructura XAdES-BES simplificada (NO XSD oficial).
  const cleanedPem = args.certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  const signatureBlock = `
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    </SignedInfo>
    <SignatureValue>${args.signatureBase64}</SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate>${cleanedPem}</X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>
</ECF>`;
  return args.xml.replace(/<\/ECF>\s*$/, signatureBlock);
}

function checkStructure(xml: string): { ok: boolean; detail?: string } {
  const required = [
    "<ECF>",
    "<RNCEmisor>",
    "<eNCF>",
    "<Totales>",
    "<MontoTotal>",
    "<Signature",
    "<SignatureValue>",
    "<X509Certificate>",
    "<PruebaLocal>",
  ];
  for (const tag of required) {
    if (!xml.includes(tag)) {
      return { ok: false, detail: `Falta ${tag}` };
    }
  }
  // Well-formed mínimo: balance básico de etiquetas. Para no incluir un
  // parser XML, hacemos una verificación de cierre.
  if (!xml.includes("</ECF>")) return { ok: false, detail: "ECF sin cerrar" };
  return { ok: true };
}

function buildQrPayload(args: {
  rnc: string;
  fingerprintShort: string;
  testId: string;
  xmlSha256: string;
}): string {
  // Payload demo. NO es el formato oficial DGII.
  return `https://dermaland.local/dgii/test-local?rnc=${args.rnc}&testId=${args.testId}&fp=${args.fingerprintShort}&hash=${args.xmlSha256.slice(0, 16)}&kind=PRUEBA_LOCAL_NO_FISCAL`;
}

function randomId(): string {
  // UUID v4 simple usando forge (evitamos depender de crypto.randomUUID
  // por compatibilidad con runtimes Edge).
  const bytes = forge.random.getBytesSync(16);
  const a = Array.from(bytes).map((b) => {
    const n = typeof b === "number" ? b : b.charCodeAt(0);
    return n.toString(16).padStart(2, "0");
  });
  // Set version 4 + variant
  const v = parseInt(a[6] ?? "00", 16);
  a[6] = ((v & 0x0f) | 0x40).toString(16).padStart(2, "0");
  const r = parseInt(a[8] ?? "00", 16);
  a[8] = ((r & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${a.slice(0, 4).join("")}-${a.slice(4, 6).join("")}-${a.slice(6, 8).join("")}-${a.slice(8, 10).join("")}-${a.slice(10, 16).join("")}`;
}

export class LocalCertTestError extends Error {
  readonly code:
    | "CERT_INVALID"
    | "CERT_EXPIRED"
    | "PARSE_FAILED"
    | "SIGN_FAILED"
    | "VERIFY_FAILED";
  constructor(code: LocalCertTestError["code"], message: string, cause?: unknown) {
    super(`LocalCertTest[${code}]: ${message}`);
    this.name = "LocalCertTestError";
    this.code = code;
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export interface RunLocalCertTestArgs {
  p12Bytes: Uint8Array;
  password: string;
  /** RNC del emisor (ya guardado en `dgii_settings` o `businesses`). */
  rncEmisor: string;
  /** Razón social del emisor. */
  razonSocialEmisor: string;
  /**
   * Contenido del XSD oficial DGII para e-CF tipo 32 (Consumo) como
   * string UTF-8. Si se omite, el paso `xsd_valid` no se ejecuta y la
   * evidencia conserva los 7 pasos clásicos. Se mantiene opcional para
   * que la versión sin XSD siga funcionando offline (tests con cert
   * dummy, entornos sin `docs/dgii/xsd/`).
   */
  xsdContentEcf32?: string;
}

export async function runLocalCertTest(
  args: RunLocalCertTestArgs,
): Promise<LocalTestEvidence> {
  const testId = randomId();
  const executedAt = new Date().toISOString();
  const steps: LocalTestEvidence["steps"] = [];

  // 1. Cargar material.
  let material: CertMaterial;
  try {
    material = loadCertMaterial(args.p12Bytes, args.password);
    steps.push({ name: "cert_loaded", ok: true });
  } catch (err) {
    throw new LocalCertTestError(
      "PARSE_FAILED",
      "no pude cargar el .p12",
      err,
    );
  }

  // 2. Validar vigencia.
  const now = Date.now();
  const validFromMs = material.cert.validity.notBefore.getTime();
  const validToMs = material.cert.validity.notAfter.getTime();
  const certValidity: LocalTestEvidence["certificate"]["validity"] =
    now < validFromMs ? "invalid" : now > validToMs ? "expired" : "valid";
  steps.push({
    name: "cert_valid",
    ok: certValidity === "valid",
    detail:
      certValidity === "valid"
        ? `vigente hasta ${material.cert.validity.notAfter.toISOString()}`
        : certValidity === "expired"
          ? `vencido el ${material.cert.validity.notAfter.toISOString()}`
          : `aún no válido (notBefore ${material.cert.validity.notBefore.toISOString()})`,
  });

  // 3. Build XML demo.
  const xml = buildXmlDemo({
    rnc: args.rncEmisor,
    razonSocial: args.razonSocialEmisor,
    testId,
  });
  steps.push({ name: "xml_built", ok: true });

  // 4. Firma.
  const xmlSha256 = sha256Hex(xml);
  let signatureBase64 = "";
  let signatureSize = 0;
  try {
    const r = signXmlDigest(xml, material.privateKey);
    signatureBase64 = r.signatureBase64;
    signatureSize = r.signatureBytes;
    steps.push({ name: "xml_signed", ok: true });
  } catch (err) {
    throw new LocalCertTestError("SIGN_FAILED", "no pude firmar el XML", err);
  }

  // 5. Verificar firma con clave pública (consistencia).
  const verified = verifyXmlSignature(xml, signatureBase64, material.cert);
  steps.push({
    name: "signature_verified",
    ok: verified,
    detail: verified ? "RSA-SHA256 verificada" : "no verificó",
  });
  if (!verified) {
    throw new LocalCertTestError(
      "VERIFY_FAILED",
      "la firma producida no verifica con la clave pública del cert",
    );
  }

  // 6. Embed signature → XML firmado.
  const signedXml = embedSignatureInXml({
    xml,
    signatureBase64,
    certPem: material.pem,
  });

  // 7. Validar estructura.
  const structure = checkStructure(signedXml);
  steps.push({
    name: "structure_valid",
    ok: structure.ok,
    detail: structure.detail,
  });

  // 8. Generar QR demo.
  const subjectField = material.cert.subject.attributes ?? [];
  const rncFromCert =
    subjectField
      .map((a) => String(a.value ?? ""))
      .map((v) => v.match(/\b(\d{9,11})\b/)?.[1])
      .find(Boolean) ?? args.rncEmisor;
  const fingerprint = (() => {
    const md = forge.md.sha256.create();
    const der = forge.asn1
      .toDer(forge.pki.certificateToAsn1(material.cert))
      .getBytes();
    md.update(der);
    const hex = md.digest().toHex().toUpperCase();
    return hex.slice(0, 8) + "…" + hex.slice(-8);
  })();
  const qrPayloadDemo = buildQrPayload({
    rnc: rncFromCert,
    fingerprintShort: fingerprint,
    testId,
    xmlSha256,
  });
  steps.push({ name: "qr_generated", ok: true });

  // 9. (opcional) Validación XSD real con e-CF tipo 32 firmado.
  //
  // Solo se ejecuta si el caller entrega el contenido del XSD oficial
  // DGII e-CF-32. Construye un e-CF MÍNIMO VÁLIDO con `buildEcfXml`,
  // lo firma con `signEcfXml` (XMLDSig enveloped, mismo formato que
  // se enviaría a DGII en Fase G) y lo valida contra el XSD con
  // `validateEcfXml` (xmllint-wasm). Si pasa, demuestra que el cert
  // produce XML aceptable estructuralmente por DGII — sin enviar nada.
  if (args.xsdContentEcf32) {
    try {
      const privateKeyPem = forge.pki.privateKeyToPem(
        material.privateKey as forge.pki.PrivateKey,
      );
      const ecfInput: EcfBuilderInput = {
        tipoEcf: "32",
        eNcf: "E320000000001",
        fechaVencimientoSecuencia: new Date(
          new Date().getFullYear() + 2,
          11,
          31,
        ),
        tipoIngresos: "01",
        tipoPago: 1,
        emisor: {
          rncEmisor: rncFromCert,
          razonSocialEmisor: args.razonSocialEmisor,
          direccionEmisor: "Prueba local sin envio DGII",
          fechaEmision: new Date(),
        },
        comprador: {},
        totales: {
          montoGravadoTotal: 100,
          itbis1: 18,
          totalItbis: 18,
          totalItbis1: 18,
          montoTotal: 118,
        },
        items: [
          {
            numeroLinea: 1,
            indicadorFacturacion: 1,
            nombreItem: "Producto demo prueba local certificado",
            indicadorBienoServicio: 1,
            cantidadItem: 1,
            precioUnitarioItem: 100,
            montoItem: 100,
          },
        ],
        fechaHoraFirma: new Date(),
      };
      const unsignedReal = buildEcfXml(ecfInput);
      const { xml: signedReal } = signEcfXml({
        xml: unsignedReal,
        certificatePem: material.pem,
        privateKeyPem,
      });
      const xsdResult = await validateEcfXml({
        xml: signedReal,
        xsd: args.xsdContentEcf32,
      });
      const firstErr = xsdResult.errors[0];
      steps.push({
        name: "xsd_valid",
        ok: xsdResult.valid,
        detail: xsdResult.valid
          ? "e-CF tipo 32 real firmado pasa XSD oficial DGII"
          : `XSD rechazó ${xsdResult.errors.length} error(es). Primero: ${
              firstErr ? firstErr.message.slice(0, 160) : "sin detalle"
            }`,
      });
    } catch (err) {
      const msg = err instanceof EcfBuilderInvalidInput
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
      steps.push({
        name: "xsd_valid",
        ok: false,
        detail: `validación XSD no se pudo completar: ${msg.slice(0, 160)}`,
      });
    }
  }

  const allOk = steps.every((s) => s.ok);

  // Subject / issuer DN para mostrar en UI.
  const attrToDn = (attrs: forge.pki.CertificateField[] | undefined) =>
    (attrs ?? [])
      .map((a) => `${a.shortName ?? a.name ?? "?"}=${a.value ?? ""}`)
      .join(", ");

  const evidence: LocalTestEvidence = {
    kind: "local-cert-test",
    testId,
    executedAt,
    result: allOk ? "passed" : "failed",
    resultMessage: allOk
      ? "Certificado validado localmente. Firma RSA-SHA256 consistente. XML estructural OK. No se envió a DGII."
      : "La prueba local detectó problemas. Revisar steps. No se envió a DGII.",
    steps,
    certificate: {
      subjectDn: attrToDn(material.cert.subject.attributes),
      issuerDn: attrToDn(material.cert.issuer.attributes),
      fingerprintSha256Short: fingerprint,
      validity: certValidity,
      rncEmisor: rncFromCert,
    },
    signedXmlBase64: Buffer.from(signedXml, "utf8").toString("base64"),
    xmlSha256,
    signatureAlgorithm: "RSA-SHA256",
    signatureSize,
    qrPayloadDemo,
    disclaimer:
      "Prueba local. No enviado a DGII. No válido fiscalmente. Esta firma RSA-SHA256 confirma que el certificado puede firmar; no equivale a un e-CF aceptado por DGII.",
  };

  return evidence;
}
