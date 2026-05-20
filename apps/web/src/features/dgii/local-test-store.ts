"use client";

import * as React from "react";

/**
 * Store mock para la última evidencia de prueba LOCAL del certificado.
 *
 * El servidor devuelve la evidencia (sin material sensible). El
 * cliente la guarda en localStorage para que:
 *  - el wizard `/dgii/habilitacion` la consuma sin re-ejecutar,
 *  - el usuario pueda descargarla como JSON.
 *
 * NUNCA persiste private key ni password.
 */

export interface StoredLocalTest {
  /** Mismo shape que `LocalTestEvidence` del servidor. */
  kind: "local-cert-test";
  testId: string;
  executedAt: string;
  result: "passed" | "failed";
  resultMessage: string;
  steps: {
    name: string;
    ok: boolean;
    detail?: string;
  }[];
  certificate: {
    subjectDn: string;
    issuerDn: string;
    fingerprintSha256Short: string;
    validity: "valid" | "expired" | "invalid";
    rncEmisor?: string;
  };
  signedXmlBase64: string;
  xmlSha256: string;
  signatureAlgorithm: "RSA-SHA256";
  signatureSize: number;
  qrPayloadDemo: string;
  disclaimer: string;
}

const STORAGE_KEY = "dermaland.dgii-local-test-evidence";
const CHANGE_EVENT = "dermaland:dgii-local-test-changed";

function readLocal(): StoredLocalTest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === "local-cert-test") return parsed as StoredLocalTest;
    return null;
  } catch {
    return null;
  }
}

function writeLocal(value: StoredLocalTest | null): void {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function saveLocalTest(evidence: StoredLocalTest): void {
  writeLocal(evidence);
}

export function clearLocalTest(): void {
  writeLocal(null);
}

export function getLocalTest(): StoredLocalTest | null {
  return readLocal();
}

export function useLocalTest(): StoredLocalTest | null {
  const [value, setValue] = React.useState<StoredLocalTest | null>(null);
  React.useEffect(() => {
    const refresh = () => setValue(readLocal());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
