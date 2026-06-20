import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import forge from "node-forge";
import {
  resolveSigningMaterial,
  CertificateStorageError,
} from "@/server/services/certificate-storage";
import { getRepositories } from "@/server/repositories";
import {
  prepareTestecfSubmission,
  TestecfClientError,
  type TestecfPreparedSubmission,
} from "./testecf-client";
import type { EcfBuilderInput, TipoEcf } from "./types";

/**
 * Orquestador Fase G dry-run.
 *
 *  1. Resuelve cert + private key del business (Supabase, server-only).
 *  2. Lee dgii_settings (RNC emisor, razón social, dirección).
 *  3. Construye un EcfBuilderInput MÍNIMO VÁLIDO para el tipo solicitado.
 *  4. Lee el XSD oficial DGII desde `docs/dgii/xsd/`.
 *  5. Llama `prepareTestecfSubmission` (NO HTTP).
 *  6. Devuelve evidencia + razones de bloqueo del envío real.
 *
 * **Garantía:** este flow NUNCA hace fetch a DGII. El cliente
 * `executeTestecfSubmission` está separado y todavía no se invoca.
 */

export type SupportedTipoEcfPreflight = "31" | "32" | "33" | "34";

export class PreflightError extends Error {
  readonly code:
    | "FEATURE_DISABLED"
    | "NO_ACTIVE_CERTIFICATE"
    | "SETTINGS_MISSING"
    | "XSD_NOT_FOUND"
    | "PARSE_PKCS12_FAILED"
    | "PREPARE_FAILED";
  constructor(code: PreflightError["code"], message: string, cause?: unknown) {
    super(`Preflight[${code}]: ${message}`);
    this.name = "PreflightError";
    this.code = code;
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export interface RunTestecfPreflightArgs {
  businessId: string;
  branchId?: string;
  userId: string;
  tipoEcf: SupportedTipoEcfPreflight;
}

export interface TestecfPreflightResult {
  /** Resultado del preparador (URLs, XSD, firma). */
  prepared: TestecfPreparedSubmission;
  /** Datos del business usados para construir el XML demo. */
  emisor: {
    businessId: string;
    rncEmisor: string;
    razonSocialEmisor: string;
  };
  /** Aviso explícito de modo dry-run. */
  mode: "dry-run";
}

// XSD path resolver — mismo patrón que /api/dgii/certificate/test-local
async function readXsdForTipo(
  tipo: SupportedTipoEcfPreflight,
): Promise<string> {
  const xsdPath = path.resolve(
    process.cwd(),
    "..",
    "..",
    "docs",
    "dgii",
    "xsd",
    `e-CF-${tipo}-v1.0.xsd`,
  );
  try {
    return await fs.readFile(xsdPath, "utf8");
  } catch (err) {
    throw new PreflightError(
      "XSD_NOT_FOUND",
      `XSD e-CF tipo ${tipo} no encontrado en ${xsdPath}`,
      err,
    );
  }
}

function parsePkcs12ToPem(
  p12Bytes: Uint8Array,
  password: string,
): { certificatePem: string; privateKeyPem: string } {
  try {
    const binary = forge.util.binary.raw.encode(p12Bytes);
    const asn1 = forge.asn1.fromDer(binary);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const certBags = p12.getBags({
      bagType: forge.pki.oids.certBag as string,
    });
    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag as string,
    });
    const cert = certBags[forge.pki.oids.certBag as string]?.[0]?.cert;
    const privateKey =
      keyBags[forge.pki.oids.pkcs8ShroudedKeyBag as string]?.[0]?.key;
    if (!cert || !privateKey) {
      throw new Error("no pude extraer cert+key del PKCS#12");
    }
    return {
      certificatePem: forge.pki.certificateToPem(cert),
      privateKeyPem: forge.pki.privateKeyToPem(privateKey as forge.pki.PrivateKey),
    };
  } catch (err) {
    throw new PreflightError(
      "PARSE_PKCS12_FAILED",
      "no pude parsear el PKCS#12 para extraer cert y key",
      err,
    );
  }
}

/**
 * Construye un EcfBuilderInput MÍNIMO VÁLIDO para el tipo solicitado,
 * usando los datos del emisor del business. El eNCF es de demo
 * (`E[tipo]0000000DEMO`) — DGII rechazaría este eNCF en envío real
 * porque no está en un rango autorizado, pero para dry-run + XSD basta.
 *
 * Cuando Fase G real se autorice, el caller debe reemplazar el eNCF
 * por uno reservado atómicamente de `ecf_sequences`.
 */
function buildDemoEcfInput(args: {
  tipoEcf: SupportedTipoEcfPreflight;
  rncEmisor: string;
  razonSocialEmisor: string;
  direccionEmisor: string;
}): EcfBuilderInput {
  const now = new Date();
  const endOfYear = new Date(now.getFullYear() + 2, 11, 31);
  // eNCF demo: 13 chars exactos (regex ^[a-zA-Z0-9]{13}$).
  const eNcf = `E${args.tipoEcf}0000000DEMO`.padEnd(13, "X").slice(0, 13);

  const base: EcfBuilderInput = {
    tipoEcf: args.tipoEcf as TipoEcf,
    eNcf,
    fechaVencimientoSecuencia: endOfYear,
    tipoIngresos: "01",
    tipoPago: 1,
    emisor: {
      rncEmisor: args.rncEmisor,
      razonSocialEmisor: args.razonSocialEmisor,
      direccionEmisor: args.direccionEmisor,
      fechaEmision: now,
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
        nombreItem: "Producto demo dry-run Fase G",
        indicadorBienoServicio: 1,
        cantidadItem: 1,
        precioUnitarioItem: 100,
        montoItem: 100,
      },
    ],
    fechaHoraFirma: now,
  };

  // Tipos 31/33/34 requieren comprador con RNC + razón social.
  if (args.tipoEcf === "31" || args.tipoEcf === "33" || args.tipoEcf === "34") {
    base.comprador = {
      rncComprador: "131234567",
      razonSocialComprador: "Cliente DEMO dry-run",
    };
  }

  // 33/34 además requieren InformacionReferencia.
  if (args.tipoEcf === "33" || args.tipoEcf === "34") {
    base.informacionReferencia = {
      ncfModificado: `E310000000001`,
      rncOtroContribuyente: "131234567",
      fechaNCFModificado: now,
      codigoModificacion: 1,
    };
  }

  return base;
}

export async function runTestecfPreflight(
  args: RunTestecfPreflightArgs,
): Promise<TestecfPreflightResult> {
  // 1. Resolver material de firma (descifrado server-side).
  let material: { p12Bytes: Uint8Array; password: string } | null;
  try {
    material = await resolveSigningMaterial({ businessId: args.businessId });
  } catch (err) {
    if (err instanceof CertificateStorageError) {
      throw new PreflightError(
        "FEATURE_DISABLED",
        `certificate-storage no disponible: ${err.message}`,
        err,
      );
    }
    throw err;
  }
  if (!material) {
    throw new PreflightError(
      "NO_ACTIVE_CERTIFICATE",
      "No hay certificado activo para este business. Subí uno en /dgii/certificado primero.",
    );
  }

  // 2. Resolver emisor.
  const repos = getRepositories();
  const settings = await repos.dgii.settings({
    businessId: args.businessId,
    branchId: args.branchId,
    userId: args.userId,
  });
  let rncEmisor = settings?.rncEmisor;
  let razonSocialEmisor = settings?.razonSocialEmisor;
  let direccionEmisor = settings?.direccionEmisor;

  if (!rncEmisor || !razonSocialEmisor) {
    // Fallback al business (Business no tiene `address`; usamos default).
    const business = await repos.business.current({
      businessId: args.businessId,
    });
    rncEmisor = rncEmisor || business?.rnc;
    razonSocialEmisor = razonSocialEmisor || business?.legalName;
  }
  direccionEmisor = direccionEmisor || "Sin dirección configurada";

  if (!rncEmisor || !razonSocialEmisor) {
    throw new PreflightError(
      "SETTINGS_MISSING",
      "RNC y/o razón social del emisor no configurados. Completá /dgii/configuracion antes del dry-run.",
    );
  }

  // 3. Parsear PKCS#12 → cert + key PEM.
  const { certificatePem, privateKeyPem } = parsePkcs12ToPem(
    material.p12Bytes,
    material.password,
  );

  // 4. Leer XSD oficial.
  const xsdContent = await readXsdForTipo(args.tipoEcf);

  // 5. Construir input demo y preparar payload.
  const ecfInput = buildDemoEcfInput({
    tipoEcf: args.tipoEcf,
    rncEmisor,
    razonSocialEmisor,
    direccionEmisor: direccionEmisor ?? "Sin dirección configurada",
  });

  let prepared: TestecfPreparedSubmission;
  try {
    prepared = await prepareTestecfSubmission({
      ecfInput,
      certificatePem,
      privateKeyPem,
      xsdContent,
      ambiente: "testecf",
    });
  } catch (err) {
    if (err instanceof TestecfClientError) {
      throw new PreflightError(
        "PREPARE_FAILED",
        err.message,
        err,
      );
    }
    throw err;
  }

  // Scrub: cert PEM y private key PEM están en memoria local; al salir
  // del scope se liberan. NO los devolvemos en el resultado.

  return {
    prepared,
    emisor: {
      businessId: args.businessId,
      rncEmisor,
      razonSocialEmisor,
    },
    mode: "dry-run",
  };
}
