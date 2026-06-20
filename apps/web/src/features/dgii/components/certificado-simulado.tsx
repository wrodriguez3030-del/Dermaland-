"use client";

import * as React from "react";
import {
  AlertTriangle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import {
  CERTIFICATE_STATUS_LABEL,
  CERTIFICATE_STATUS_TONE,
  resetCertificateStatus,
  setCertificateStatus,
  useCertificateStatus,
  type CertificateStatus,
} from "@/features/dgii/certificate-status-store";

/**
 * Modo simulado (DATA_SOURCE=mock o sin DGII_CERT_ENCRYPTION_KEY).
 *
 * No procesa archivos. Solo permite transitar entre estados para que
 * el wizard `/dgii/habilitacion` reaccione sin material real.
 */

const DEMO_TRANSITIONS: {
  status: CertificateStatus;
  alias?: string;
  validTo?: string;
  description: string;
}[] = [
  {
    status: "uploaded",
    alias: "DermaLand DEMO Cert",
    validTo: "2027-05-20",
    description: "Simular certificado cargado, pendiente de validación.",
  },
  {
    status: "valid",
    alias: "DermaLand DEMO Cert",
    validTo: "2027-05-20",
    description: "Certificado válido. El paso 1 del wizard se desbloquea.",
  },
  {
    status: "expired",
    alias: "DermaLand DEMO Cert",
    validTo: "2025-01-01",
    description: "Certificado vencido. El wizard pasa a 'Bloqueado'.",
  },
  {
    status: "invalid",
    alias: "DermaLand DEMO Cert",
    validTo: "2026-05-20",
    description: "Certificado inválido (firma o titular no coincide).",
  },
];

export function CertificadoSimulado() {
  const cert = useCertificateStatus();
  const [fileName, setFileName] = React.useState<string>("");
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const isLocked =
    cert.status === "not_uploaded" ||
    cert.status === "expired" ||
    cert.status === "invalid";

  function handleSimulatedUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName) {
      setFeedback("Selecciona un archivo (la simulación NO lo procesa).");
      return;
    }
    setCertificateStatus("uploaded", {
      alias: fileName.replace(/\.(p12|pfx)$/i, ""),
      validTo: "2027-05-20",
    });
    setFeedback(
      "Subida simulada registrada. El archivo NO se envía a ningún servidor; solo se guarda el estado en localStorage.",
    );
  }

  function applyTransition(t: (typeof DEMO_TRANSITIONS)[number]) {
    setCertificateStatus(t.status, {
      alias: t.alias,
      validTo: t.validTo,
    });
    setFeedback(
      `Estado simulado: ${CERTIFICATE_STATUS_LABEL[t.status]} (${t.description})`,
    );
  }

  function handleReset() {
    resetCertificateStatus();
    setFeedback("Estado del certificado reiniciado a 'Sin cargar'.");
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>MOCK / DEMO / NO FISCAL.</strong> Este formulario no
            envía archivos a ningún servidor, no almacena una `.p12` real ni
            una contraseña real. Sólo se actualiza el estado simulado del
            certificado en tu navegador para que puedas recorrer el wizard
            de habilitación. Para activar el upload real ver{" "}
            <code className="font-mono text-xs">
              docs/dgii/runbook-fase-f-g-h.md
            </code>
            .
          </div>
        </div>
      </div>

      <Card
        className={`mb-6 ${
          isLocked
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <CardContent>
          <div className="flex flex-wrap items-start gap-3">
            {isLocked ? (
              <ShieldOff className="mt-0.5 h-5 w-5 text-amber-700" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
            )}
            <div className="flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Estado:</strong>
                <Badge tone={CERTIFICATE_STATUS_TONE[cert.status]}>
                  {CERTIFICATE_STATUS_LABEL[cert.status]}
                </Badge>
                {cert.alias && (
                  <span className="opacity-70">· {cert.alias}</span>
                )}
                {cert.validTo && (
                  <span className="opacity-70">
                    · vence {cert.validTo}
                  </span>
                )}
              </div>
            </div>
            {cert.status !== "not_uploaded" && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reiniciar estado
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {feedback && (
        <div className="mb-4 rounded-lg border border-black/10 bg-white p-3 text-xs">
          {feedback}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Subir certificado (modo simulado)
            <Badge tone="warning" className="text-[10px]">
              <Lock className="h-3 w-3" />
              Sin procesamiento real
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Selecciona un archivo `.p12` o `.pfx` para simular la subida.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSimulatedUpload} className="space-y-4">
            <div>
              <Label htmlFor="cert-file">Archivo `.p12` / `.pfx`</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="cert-file"
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  onChange={(e) =>
                    setFileName(e.target.files?.[0]?.name ?? "")
                  }
                />
                <Button type="submit" variant="outline" size="sm">
                  <Upload className="h-4 w-4" />
                  Simular subida
                </Button>
              </div>
              {fileName && (
                <p className="mt-1 text-[11px] opacity-60">
                  Archivo seleccionado:{" "}
                  <code className="font-mono">{fileName}</code> · NO se subió.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cert-password">
                  Contraseña del certificado
                </Label>
                <Input
                  id="cert-password"
                  type="password"
                  placeholder="•••••••• (no se procesa)"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="cert-password-confirm">Confirmar contraseña</Label>
                <Input
                  id="cert-password-confirm"
                  type="password"
                  placeholder="•••••••• (no se procesa)"
                  autoComplete="off"
                />
              </div>
            </div>
            <p className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-70">
              <ShieldAlert className="mr-1 inline h-3 w-3" /> En esta fase
              mock no se envía nada al servidor.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Simulador de estados (QA del wizard)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {DEMO_TRANSITIONS.map((t) => (
            <div
              key={t.status}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={CERTIFICATE_STATUS_TONE[t.status]}>
                    {CERTIFICATE_STATUS_LABEL[t.status]}
                  </Badge>
                  {t.validTo && (
                    <span className="text-xs opacity-60">
                      vence {t.validTo}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs opacity-70">{t.description}</p>
              </div>
              <Button
                size="sm"
                variant={cert.status === t.status ? "outline" : "primary"}
                onClick={() => applyTransition(t)}
                disabled={cert.status === t.status}
              >
                {cert.status === t.status ? "Estado actual" : "Aplicar"}
              </Button>
            </div>
          ))}
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reiniciar a "Sin cargar"
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
