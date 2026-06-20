"use client";

import * as React from "react";
import {
  setCertificateStatus,
  useCertificateStatus,
  type CertificateMockState,
} from "./certificate-status-store";

interface ApiResponse {
  enabled: boolean;
  certificate: {
    id: string;
    alias: string;
    validity: "valid" | "expired" | "invalid";
    validTo: string;
  } | null;
  error?: string;
}

/**
 * Lee el estado del certificado priorizando el server (Fase F).
 *
 * Flujo:
 *  1. En mount, fetch a `/api/dgii/certificate/current`.
 *  2. Si el server devuelve un cert real, sincroniza el local store.
 *  3. Devuelve siempre el estado del local store (que ahora refleja el
 *     valor server o el simulado del DEMO).
 *
 * Esto hace que el wizard `/dgii/habilitacion` se mantenga consistente
 * sin importar por dónde entró el usuario.
 */
export function useSyncedCertificate(): CertificateMockState {
  const local = useCertificateStatus();

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/dgii/certificate/current", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ApiResponse | null) => {
        if (cancelled || !data || !data.certificate) return;
        setCertificateStatus(data.certificate.validity, {
          alias: data.certificate.alias,
          validTo: data.certificate.validTo.slice(0, 10),
        });
      })
      .catch(() => {
        // silencio: en modo mock el endpoint puede devolver 401 etc.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return local;
}
