import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/context";
import { isCertificateUploadEnabled } from "@/lib/env";
import {
  resolveSigningMaterial,
  CertificateStorageError,
} from "@/server/services/certificate-storage";
import {
  runLocalCertTest,
  LocalCertTestError,
  type LocalTestEvidence,
} from "@/server/services/local-cert-test";
import { getRepositories } from "@/server/repositories";

/**
 * POST /api/dgii/certificate/test-local
 *
 * Ejecuta una prueba LOCAL del certificado activo:
 *  1. Verifica que Fase F esté habilitada.
 *  2. Resuelve el material de firma (descifra blob + password
 *     server-only).
 *  3. Genera XML demo, firma RSA-SHA256, verifica, valida estructura
 *     y genera QR demo.
 *  4. Devuelve evidencia (sin private key, sin password).
 *
 * NUNCA llama a DGII. NUNCA envía XML real. NUNCA consume secuencias.
 */
export async function POST() {
  if (!isCertificateUploadEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        reason: "feature_disabled",
        message: "Fase F deshabilitada en este entorno.",
      },
      { status: 403 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401 },
    );
  }

  // Tomar settings DGII si existen (para razón social/RNC del emisor).
  // Si no hay settings, usar fallback del business.
  let rnc = "000000000";
  let razonSocial = "DermaLand SRL";
  try {
    const repos = getRepositories();
    const settings = await repos.dgii.settings({
      businessId: session.businessId,
      branchId: session.branchId,
      userId: session.user.id,
    });
    if (settings) {
      rnc = settings.rncEmisor || rnc;
      razonSocial = settings.razonSocialEmisor || razonSocial;
    } else {
      const business = await repos.business.current({
        businessId: session.businessId,
      });
      if (business) {
        rnc = business.rnc || rnc;
        razonSocial = business.legalName || razonSocial;
      }
    }
  } catch (err) {
    // No bloqueante: usamos fallbacks. El test sigue siendo local y
    // didáctico — no se envía a DGII.
    console.warn("[test-local] no pude leer settings/business:", err);
  }

  // Resolver material de firma.
  let material: { p12Bytes: Uint8Array; password: string } | null;
  try {
    material = await resolveSigningMaterial({ businessId: session.businessId });
  } catch (err) {
    if (err instanceof CertificateStorageError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "storage_error",
          code: err.code,
          message: err.message,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "unknown_storage_error" },
      { status: 500 },
    );
  }
  if (!material) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no_active_certificate",
        message:
          "No hay certificado activo. Sube un .p12/.pfx en /dgii/certificado primero.",
      },
      { status: 412 },
    );
  }

  // Ejecutar prueba local.
  let evidence: LocalTestEvidence;
  try {
    evidence = runLocalCertTest({
      p12Bytes: material.p12Bytes,
      password: material.password,
      rncEmisor: rnc,
      razonSocialEmisor: razonSocial,
    });
  } catch (err) {
    if (err instanceof LocalCertTestError) {
      return NextResponse.json(
        { ok: false, reason: "test_failed", code: err.code, message: err.message },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "unknown_test_error" },
      { status: 500 },
    );
  } finally {
    // Limpieza: el material ya no se necesita.
    if (material) {
      // sobreescribir bytes y password reference
      material = null;
    }
  }

  return NextResponse.json({ ok: true, evidence });
}
