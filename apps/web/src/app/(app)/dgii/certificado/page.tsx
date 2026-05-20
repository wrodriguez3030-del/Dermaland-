"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
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
  AlertTriangle,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Upload,
} from "lucide-react";
import {
  CERTIFICATE_STATUS_LABEL,
  CERTIFICATE_STATUS_TONE,
  resetCertificateStatus,
  setCertificateStatus,
  useCertificateStatus,
  type CertificateStatus,
} from "@/features/dgii/certificate-status-store";

/**
 * /dgii/certificado — pantalla del certificado digital DGII.
 *
 * MODO MOCK / DEMO / NO FISCAL.
 *
 * Esta página NO procesa un archivo .p12 real ni guarda una password real.
 * Lo único que persiste es el estado del certificado simulado en
 * `dermaland.dgii-certificate-status` (localStorage del navegador), que el
 * wizard `/dgii/habilitacion` consume para reflejar el avance del paso 1.
 *
 * El día que se autorice **Fase F** (ver `docs/dgii/runbook-fase-f-g-h.md`):
 *  - el form llamará a `/api/dgii/certificate/upload`,
 *  - el blob `.p12` se cifrará con AES-256-GCM antes de subir a Storage,
 *  - la password viajará por server action y se almacenará en Vault.
 *
 * Hasta entonces, esta UI permite **simular** distintos estados (sin
 * cargar, cargado, válido, vencido, inválido) para que el equipo pueda
 * recorrer el wizard y validar bloqueos / desbloqueos sin material real.
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
    description:
      "Simular que el certificado fue cargado y queda pendiente de validación.",
  },
  {
    status: "valid",
    alias: "DermaLand DEMO Cert",
    validTo: "2027-05-20",
    description:
      "Simular certificado válido (vigente). El paso 1 del wizard se desbloquea.",
  },
  {
    status: "expired",
    alias: "DermaLand DEMO Cert",
    validTo: "2025-01-01",
    description:
      "Simular certificado vencido. El wizard pasa a 'Bloqueado por certificado'.",
  },
  {
    status: "invalid",
    alias: "DermaLand DEMO Cert",
    validTo: "2026-05-20",
    description:
      "Simular certificado inválido (firma incorrecta o titular no coincide).",
  },
];

export default function CertificadoPage() {
  const cert = useCertificateStatus();
  const [fileName, setFileName] = React.useState<string>("");
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const isLocked =
    cert.status === "not_uploaded" || cert.status === "expired" || cert.status === "invalid";

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
      <PageHeader
        title="Certificado digital"
        description="Archivo `.p12` o `.pfx` cifrado. Acceso solo desde Edge Function `dgii-sign-xml`. Modo MOCK / DEMO — ningún archivo real se procesa."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Certificado" },
        ]}
        actions={
          <Link href="/dgii/habilitacion">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
              Volver al wizard
            </Button>
          </Link>
        }
      />

      {/* Banner MOCK */}
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>MOCK / DEMO / NO FISCAL.</strong> Este formulario no envía
            archivos a ningún servidor, no almacena una `.p12` real ni una
            contraseña real. Sólo se actualiza el estado simulado del
            certificado en tu navegador para que puedas recorrer el wizard
            de habilitación. Ver{" "}
            <code className="font-mono text-xs">
              docs/dgii/runbook-fase-f-g-h.md
            </code>{" "}
            para el plan de activación real (Fase F).
          </div>
        </div>
      </div>

      {/* Estado actual */}
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
                {cert.alias && <span className="opacity-70">· {cert.alias}</span>}
                {cert.validTo && (
                  <span className="opacity-70">· vence {cert.validTo}</span>
                )}
              </div>
              {cert.status === "not_uploaded" && (
                <p className="mt-1 text-amber-900">
                  Sin certificado cargado. El wizard de habilitación está
                  bloqueado en el paso 1.
                </p>
              )}
              {cert.status === "uploaded" && (
                <p className="mt-1 opacity-80">
                  Certificado cargado pero pendiente de validación. Marca como
                  "Válido" cuando confirmes vigencia y titular.
                </p>
              )}
              {cert.status === "valid" && (
                <p className="mt-1 text-emerald-900">
                  Certificado válido. Puedes avanzar al paso 2 (Configuración
                  fiscal).
                </p>
              )}
              {cert.status === "expired" && (
                <p className="mt-1 text-amber-900">
                  Certificado vencido. Hay que renovarlo con la Autoridad
                  Certificadora antes de avanzar.
                </p>
              )}
              {cert.status === "invalid" && (
                <p className="mt-1 text-amber-900">
                  Certificado inválido. Verifica archivo y contraseña, o pide
                  una nueva emisión.
                </p>
              )}
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

      {/* Subida simulada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Subir certificado (modo simulado)
            <Badge tone="warning" className="text-[10px]">
              <Lock className="h-3 w-3" />
              Sin procesamiento real · Fase F
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Selecciona un archivo `.p12` o `.pfx` para simular la subida. El
            archivo permanece en tu navegador y <strong>no se sube a ningún
            servidor</strong>. La contraseña tampoco se procesa.
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
                  aria-describedby="cert-file-hint"
                />
                <Button type="submit" variant="outline" size="sm">
                  <Upload className="h-4 w-4" />
                  Simular subida
                </Button>
              </div>
              {fileName && (
                <p className="mt-1 text-[11px] opacity-60">
                  Archivo seleccionado: <code className="font-mono">{fileName}</code>{" "}
                  · NO se subió a servidor.
                </p>
              )}
              <p
                id="cert-file-hint"
                className="mt-1 text-[11px] opacity-60"
              >
                Tipos aceptados visualmente: `.p12`, `.pfx`. En modo simulado
                el contenido no se lee.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cert-password">Contraseña del certificado</Label>
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
              <ShieldAlert className="mr-1 inline h-3 w-3" /> Seguridad: en
              esta fase mock no se envía nada al servidor. En Fase F real, la
              contraseña se cifrará con KMS (Supabase Vault o key derivada
              de `DGII_CERT_ENCRYPTION_KEY` + per-business salt) y nunca se
              expone en logs ni en el cliente.
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Simulador de estados — útil para QA del wizard */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Simulador de estados (QA del wizard)</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Fija manualmente el estado del certificado para validar cómo
            reacciona el wizard. Solo afecta el estado simulado local; no
            existe un certificado real detrás.
          </p>
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
                    <span className="text-xs opacity-60">vence {t.validTo}</span>
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

      {/* Lo que viene cuando Fase F se autorice */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Qué cambia cuando se autorice Fase F</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="ml-5 list-disc space-y-1 text-sm opacity-80">
            <li>
              El form deja de ser simulado y llama a{" "}
              <code className="font-mono text-xs">
                /api/dgii/certificate/upload
              </code>
              .
            </li>
            <li>
              El blob `.p12` se cifra con AES-256-GCM en el servidor antes de
              subirse a Supabase Storage (bucket privado `certificates`).
            </li>
            <li>
              La contraseña se almacena cifrada en Vault, nunca en plaintext y
              nunca en variables de entorno.
            </li>
            <li>
              La firma XAdES-BES se ejecuta en una Edge Function que es la
              única con permiso para descifrar el blob.
            </li>
            <li>
              El estado del certificado pasa a leerse de la tabla{" "}
              <code className="font-mono text-xs">dgii_certificates</code> (RLS
              por business) y el `certificate-status-store` local se mantiene
              solo como fallback de UI.
            </li>
          </ul>
          <p className="mt-3 text-xs opacity-60">
            Plan completo: <code className="font-mono text-xs">docs/dgii/runbook-fase-f-g-h.md</code>.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
