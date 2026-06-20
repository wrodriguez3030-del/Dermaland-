import "server-only";
import forge from "node-forge";
import { buildEcfXml, EcfBuilderInvalidInput } from "./builder";
import { signEcfXml } from "./signer";
import { validateEcfXml } from "./validator";
import type { EcfBuilderInput } from "./types";
import { isDgiiTestecfSendEnabled, resolveDgiiAmbiente, env } from "@/lib/env";

/**
 * Cliente DGII testecf — **modo dry-run por defecto**.
 *
 * **Política operativa (no negociable):**
 *
 *  1. `prepareTestecfSubmission()` es PURA y SERVER-SIDE: lee cert + key,
 *     construye e-CF, valida XSD, firma con XMLDSig, calcula las URLs
 *     que se invocarían en testecf, y devuelve evidencia sin secretos.
 *     **No hace fetch a DGII. Nunca.**
 *
 *  2. `executeTestecfSubmission()` es la futura ruta hacia DGII real.
 *     Tira `TestecfSendDisabled` SI cualquiera de estas condiciones falla:
 *       - `DGII_TESTECF_SEND_ENABLED !== "true"`
 *       - `ambiente !== "testecf"` (jamás certecf ni ecf)
 *       - `postulacionApproved !== true` (confirmación externa)
 *       - `rangoAuthorized !== true` (rango e-NCF DGII para el RNC+tipo)
 *       - `userConfirmedAt` ausente o vencido
 *     Hoy SIEMPRE tira porque `DGII_TESTECF_SEND_ENABLED` default `false`
 *     y el body NO recibe las confirmaciones todavía.
 *
 *  3. **Endpoint de producción está hardcoded como prohibido.** Si alguien
 *     pasa una baseUrl que apunte a `/ecf/`, el constructor del payload
 *     se rehúsa.
 *
 *  4. **Cero logs de password / cert / private key / token / payload
 *     completo.** La evidencia devuelta incluye solo metadata pública y
 *     URLs.
 */

export class TestecfSendDisabled extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(
      `Envío real a DGII testecf bloqueado. Motivos: ${reasons.join("; ")}`,
    );
    this.name = "TestecfSendDisabled";
    this.reasons = reasons;
  }
}

export class TestecfClientError extends Error {
  readonly code:
    | "INVALID_AMBIENTE"
    | "INVALID_BASE_URL"
    | "BUILD_FAILED"
    | "XSD_FAILED"
    | "SIGN_FAILED"
    | "VALIDATION_VERIFY_FAILED";
  constructor(code: TestecfClientError["code"], message: string, cause?: unknown) {
    super(`TestecfClient[${code}]: ${message}`);
    this.name = "TestecfClientError";
    this.code = code;
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// URLs por ambiente
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URLS = {
  testecf: "https://ecf.dgii.gov.do/testecf",
  certecf: "https://ecf.dgii.gov.do/certecf",
  ecf: "https://ecf.dgii.gov.do/ecf",
} as const;

type Ambiente = "testecf" | "certecf" | "ecf";

/**
 * Resuelve la baseUrl del ambiente respetando overrides por env var.
 * Refuse silenciosamente cualquier intento de hacer pasar una URL de
 * producción para testecf.
 */
function resolveBaseUrl(ambiente: Ambiente): string {
  const override =
    ambiente === "testecf"
      ? env.DGII_BASE_URL_TESTECF
      : ambiente === "certecf"
        ? env.DGII_BASE_URL_CERTECF
        : env.DGII_BASE_URL_ECF;
  const candidate = override ?? DEFAULT_BASE_URLS[ambiente];

  // Sanity check anti-bait-and-switch: si pretendemos testecf pero el
  // override apunta a /ecf/ (prod), rechazar.
  if (ambiente === "testecf" && /\/ecf(\/|$)/.test(candidate)) {
    throw new TestecfClientError(
      "INVALID_BASE_URL",
      `override de DGII_BASE_URL_TESTECF parece apuntar a producción: ${candidate}`,
    );
  }
  return candidate.replace(/\/+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de evidencia
// ─────────────────────────────────────────────────────────────────────────────

export interface TestecfPreparedSubmission {
  /** Marca de tiempo + identificador único del dry-run. */
  prepareId: string;
  preparedAt: string;

  /** Ambiente resuelto. Garantizado `testecf` salvo override explícito. */
  ambiente: Ambiente;
  /** baseUrl efectiva del ambiente (sin trailing slash). */
  baseUrl: string;

  /** URLs que se invocarían en orden real. */
  endpoints: {
    semilla: string;
    validarSemilla: string;
    recepcionEcf: string;
  };

  /** Datos del e-CF preparado. */
  ecf: {
    tipoEcf: EcfBuilderInput["tipoEcf"];
    eNcf: string;
    rncEmisor: string;
    razonSocialEmisor: string;
    rncComprador?: string;
    montoTotal: number;
  };

  /** Resultados de validación local. */
  validation: {
    xsdValid: boolean;
    xsdErrors: { line: number | null; message: string }[];
    signatureEmbedded: boolean;
    signatureVerifiedLocally: boolean;
  };

  /** Tamaños del payload final (útil para diagnóstico). */
  payloadSize: {
    unsignedXmlBytes: number;
    signedXmlBytes: number;
    signedXmlBase64Bytes: number;
  };

  /**
   * XML firmado completo en base64 (público — contiene cert PEM público
   * en KeyInfo, no contiene private key). Lo devolvemos para que la UI
   * pueda mostrarlo / descargarlo en modo demo. NUNCA loggeamos esto en
   * stdout porque es voluminoso, pero es público.
   */
  signedXmlBase64: string;

  /** Estado de envío real (siempre disabled en este build). */
  send: {
    enabled: boolean;
    blockingReasons: string[];
  };

  /** Aviso operativo persistente. */
  disclaimer: string;
}

export interface PrepareTestecfSubmissionArgs {
  /** Input completo del builder e-CF (ya mapeado desde dgii_settings). */
  ecfInput: EcfBuilderInput;
  /** Cert + key del firmante en PEM. Caller los descifra y los limpia. */
  certificatePem: string;
  privateKeyPem: string;
  /** XSD oficial DGII que aplica al tipoEcf. Caller lo lee de disco. */
  xsdContent: string;
  /** Ambiente target. Default desde env (`testecf` por default). */
  ambiente?: Ambiente;
}

// ─────────────────────────────────────────────────────────────────────────────
// prepareTestecfSubmission — dry-run, NO HTTP
// ─────────────────────────────────────────────────────────────────────────────

export async function prepareTestecfSubmission(
  args: PrepareTestecfSubmissionArgs,
): Promise<TestecfPreparedSubmission> {
  const ambiente = args.ambiente ?? (resolveDgiiAmbiente() as Ambiente);
  // Anti-foot-gun: este cliente está hecho para testecf. Si el caller
  // resuelve `ecf` (prod) o `certecf`, le decimos NO.
  if (ambiente !== "testecf") {
    throw new TestecfClientError(
      "INVALID_AMBIENTE",
      `prepareTestecfSubmission solo soporta ambiente="testecf". Recibido: "${ambiente}".`,
    );
  }

  const baseUrl = resolveBaseUrl(ambiente);

  // 1. Build XML.
  let unsignedXml: string;
  try {
    unsignedXml = buildEcfXml(args.ecfInput);
  } catch (err) {
    if (err instanceof EcfBuilderInvalidInput) {
      throw new TestecfClientError("BUILD_FAILED", err.message, err);
    }
    throw new TestecfClientError(
      "BUILD_FAILED",
      `buildEcfXml falló: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // 2. Firmar.
  let signedXml: string;
  try {
    const result = signEcfXml({
      xml: unsignedXml,
      certificatePem: args.certificatePem,
      privateKeyPem: args.privateKeyPem,
    });
    signedXml = result.xml;
  } catch (err) {
    throw new TestecfClientError(
      "SIGN_FAILED",
      `signEcfXml falló: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
  const signatureEmbedded = /<(?:[\w-]+:)?Signature\b/.test(signedXml);

  // 3. Validar XSD.
  const xsdResult = await validateEcfXml({
    xml: signedXml,
    xsd: args.xsdContent,
  });

  // 4. Verificar firma localmente con la pública del cert.
  let signatureVerifiedLocally = false;
  try {
    const cert = forge.pki.certificateFromPem(args.certificatePem);
    // verifyEcfSignature está en ./signer, lo importamos lazily para no
    // forzar la dep en este módulo.
    const { verifyEcfSignature } = await import("./signer");
    signatureVerifiedLocally = verifyEcfSignature(signedXml, args.certificatePem);
    // El forge import garantiza que el PEM es parseable.
    void cert;
  } catch (err) {
    throw new TestecfClientError(
      "VALIDATION_VERIFY_FAILED",
      `verificación local de firma falló: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // 5. Calcular endpoints (no se invocan).
  const endpoints = {
    semilla: `${baseUrl}/autenticacion/api/autenticacion/semilla`,
    validarSemilla: `${baseUrl}/autenticacion/api/autenticacion/validarsemilla`,
    recepcionEcf: `${baseUrl}/recepcion/api/ecf`,
  };

  // 6. Computar razones de bloqueo del envío real.
  const blockingReasons: string[] = [];
  if (!isDgiiTestecfSendEnabled()) {
    blockingReasons.push("DGII_TESTECF_SEND_ENABLED !== 'true'");
  }
  if (!xsdResult.valid) {
    blockingReasons.push(
      `XSD oficial DGII rechazó el XML firmado (${xsdResult.errors.length} error(es))`,
    );
  }
  if (!signatureVerifiedLocally) {
    blockingReasons.push("firma local no verifica con la pública del cert");
  }
  // Las siguientes no son verificables en dry-run; las marcamos como
  // gates externos que deben confirmarse antes de cualquier execute.
  blockingReasons.push(
    "postulación testecf del RNC emisor sin confirmar externamente",
  );
  blockingReasons.push(
    "rango e-NCF testecf autorizado por DGII para el tipo sin confirmar",
  );
  blockingReasons.push("usuario debe confirmar manualmente cada envío real");

  const signedXmlBytes = Buffer.byteLength(signedXml, "utf8");
  const signedXmlBase64 = Buffer.from(signedXml, "utf8").toString("base64");

  return {
    prepareId: cryptoRandomUuid(),
    preparedAt: new Date().toISOString(),
    ambiente,
    baseUrl,
    endpoints,
    ecf: {
      tipoEcf: args.ecfInput.tipoEcf,
      eNcf: args.ecfInput.eNcf,
      rncEmisor: args.ecfInput.emisor.rncEmisor,
      razonSocialEmisor: args.ecfInput.emisor.razonSocialEmisor,
      rncComprador: args.ecfInput.comprador.rncComprador,
      montoTotal: args.ecfInput.totales.montoTotal,
    },
    validation: {
      xsdValid: xsdResult.valid,
      xsdErrors: xsdResult.errors.map((e) => ({
        line: e.line,
        message: e.message.slice(0, 240),
      })),
      signatureEmbedded,
      signatureVerifiedLocally,
    },
    payloadSize: {
      unsignedXmlBytes: Buffer.byteLength(unsignedXml, "utf8"),
      signedXmlBytes,
      signedXmlBase64Bytes: signedXmlBase64.length,
    },
    signedXmlBase64,
    send: {
      enabled: false,
      blockingReasons,
    },
    disclaimer:
      "Dry-run Fase G. NO se envió nada a DGII. NO se consumió secuencia. " +
      "El payload está listo para Fase G real cuando se autorice " +
      "DGII_TESTECF_SEND_ENABLED + postulación + rango + confirmación " +
      "manual.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// executeTestecfSubmission — bloqueado por defecto
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecuteTestecfSubmissionArgs
  extends PrepareTestecfSubmissionArgs {
  /** Confirmación externa: postulación DGII testecf aprobada para el RNC. */
  postulacionApproved: boolean;
  /** Confirmación externa: rango e-NCF testecf autorizado por DGII. */
  rangoAuthorized: boolean;
  /** Timestamp ISO de la confirmación manual del usuario. */
  userConfirmedAt: string;
}

/**
 * Ejecuta el envío real a DGII testecf.
 *
 * **STUB. NO hace fetch.** En este build, siempre tira `TestecfSendDisabled`.
 * Cuando se autorice Fase G real, esta función orquesta el flow:
 *   1. GET `endpoints.semilla` → recibir XML semilla
 *   2. Firmar la semilla con el cert (XMLDSig)
 *   3. POST `endpoints.validarSemilla` → recibir bearer token
 *   4. POST `endpoints.recepcionEcf` (multipart) → recibir trackId
 *   5. Persistir request/response/track_id en `dgii_submissions`
 *   6. Audit log
 *
 * El throw inicial NO depende del cuerpo de la función (no llega al
 * primer fetch) — esto garantiza que ni siquiera por accidente se haga
 * una llamada HTTP.
 */
export async function executeTestecfSubmission(
  args: ExecuteTestecfSubmissionArgs,
): Promise<never> {
  const reasons: string[] = [];

  if (!isDgiiTestecfSendEnabled()) {
    reasons.push("DGII_TESTECF_SEND_ENABLED !== 'true' (killswitch)");
  }

  const ambiente = args.ambiente ?? (resolveDgiiAmbiente() as Ambiente);
  if (ambiente !== "testecf") {
    reasons.push(`ambiente debe ser 'testecf'; recibido '${ambiente}'`);
  }

  if (!args.postulacionApproved) {
    reasons.push("postulacionApproved !== true");
  }
  if (!args.rangoAuthorized) {
    reasons.push("rangoAuthorized !== true");
  }
  if (!args.userConfirmedAt) {
    reasons.push("userConfirmedAt vacío (sin confirmación manual)");
  }

  // Garantía: siempre paramos aquí, incluso si todas las flags fueran true.
  // El cuerpo HTTP real está pendiente de autorización formal de Fase G,
  // momento en que se implementa.
  reasons.push(
    "executeTestecfSubmission no implementada todavía — Fase G real bloqueada",
  );

  throw new TestecfSendDisabled(reasons);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function cryptoRandomUuid(): string {
  // node:crypto está disponible server-side; usamos forge para evitar
  // dependencia adicional aunque crypto.randomUUID también funciona.
  const bytes = forge.random.getBytesSync(16);
  const a = Array.from(bytes).map((b) => {
    const n = typeof b === "number" ? b : (b as string).charCodeAt(0);
    return n.toString(16).padStart(2, "0");
  });
  const v = parseInt(a[6] ?? "00", 16);
  a[6] = ((v & 0x0f) | 0x40).toString(16).padStart(2, "0");
  const r = parseInt(a[8] ?? "00", 16);
  a[8] = ((r & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${a.slice(0, 4).join("")}-${a.slice(4, 6).join("")}-${a.slice(6, 8).join("")}-${a.slice(8, 10).join("")}-${a.slice(10, 16).join("")}`;
}
