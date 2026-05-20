"use client";

import * as React from "react";
import {
  AlertTriangle,
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
  setCertificateStatus,
} from "@/features/dgii/certificate-status-store";
import {
  uploadCertificateAction,
  type PublicCertificate,
  type UploadResult,
} from "@/features/dgii/certificate-actions";

/**
 * Modo real (Fase F).
 *
 * Form que envía el `.p12` y la contraseña al server action
 * `uploadCertificateAction`. El servidor hace:
 *  1. parsea PKCS#12 con `node-forge`,
 *  2. cifra blob + password con AES-256-GCM,
 *  3. persiste en `dgii_certificates`,
 *  4. audit log.
 *
 * El cliente NUNCA tiene la clave privada ni el blob descifrado.
 * Después del upload sincronizamos el `certificate-status-store`
 * (localStorage) para que el wizard refleje el resultado inmediatamente.
 */

const VALIDITY_TO_LOCAL: Record<
  PublicCertificate["validity"],
  "valid" | "expired" | "invalid"
> = {
  valid: "valid",
  expired: "expired",
  invalid: "invalid",
};

export function CertificadoReal({
  initialCertificate,
}: {
  initialCertificate: PublicCertificate | null;
}) {
  const [cert, setCert] = React.useState<PublicCertificate | null>(
    initialCertificate,
  );
  const [feedback, setFeedback] = React.useState<{
    tone: "ok" | "error" | "info";
    text: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [fileName, setFileName] = React.useState("");

  // Sincronizar el store local con el cert real al montar y tras update.
  React.useEffect(() => {
    if (!cert) {
      setCertificateStatus("not_uploaded");
      return;
    }
    setCertificateStatus(VALIDITY_TO_LOCAL[cert.validity], {
      alias: cert.alias,
      validTo: cert.validTo.slice(0, 10),
    });
  }, [cert]);

  async function handleSubmit(formData: FormData) {
    setFeedback(null);
    const result: UploadResult = await uploadCertificateAction(formData);
    if (!result.ok) {
      setFeedback({
        tone: "error",
        text: result.error ?? "No fue posible procesar el certificado.",
      });
      return;
    }
    if (result.certificate) {
      setCert(result.certificate);
      setFeedback({
        tone: "ok",
        text:
          result.status === "valid"
            ? "Certificado válido cargado y activado."
            : `Certificado cargado con estado ${result.status}. Revisa antes de activar Fase G.`,
      });
    }
  }

  const status = cert?.validity ?? "not_uploaded";
  const isOk = cert?.validity === "valid";
  const isLocked =
    !cert || cert.validity === "expired" || cert.validity === "invalid";

  return (
    <>
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Fase F activa en Preview Supabase.</strong> El archivo y
            la contraseña viajan únicamente al server action. El blob `.p12`
            y la contraseña se cifran con AES-256-GCM antes de tocar la
            base. <strong>NO se envía nada a DGII todavía</strong>: Fase G
            (envío a testecf) y Fase H (TrackId) siguen bloqueadas. Ver{" "}
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
            {isOk ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
            ) : (
              <ShieldOff className="mt-0.5 h-5 w-5 text-amber-700" />
            )}
            <div className="flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Estado:</strong>
                <Badge
                  tone={
                    CERTIFICATE_STATUS_TONE[
                      cert ? VALIDITY_TO_LOCAL[cert.validity] : "not_uploaded"
                    ]
                  }
                >
                  {
                    CERTIFICATE_STATUS_LABEL[
                      cert ? VALIDITY_TO_LOCAL[cert.validity] : "not_uploaded"
                    ]
                  }
                </Badge>
                {cert?.alias && (
                  <span className="opacity-70">· {cert.alias}</span>
                )}
              </div>
              {!cert ? (
                <p className="mt-1 text-amber-900">
                  Sin certificado activo. El paso 1 del wizard de
                  habilitación queda bloqueado.
                </p>
              ) : (
                <CertDetails cert={cert} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {feedback && (
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            feedback.tone === "error"
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : feedback.tone === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-black/10 bg-white"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {cert ? "Reemplazar certificado" : "Subir certificado"}
          </CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Archivo `.p12` o `.pfx` emitido por una Autoridad
            Certificadora aprobada por DGII. Procesamiento 100% server-side.
            La contraseña <strong>no se almacena en texto plano</strong> y
            <strong> no se imprime en logs</strong>.
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) => startTransition(() => handleSubmit(fd))}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="cert-file">Archivo `.p12` / `.pfx`</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="cert-file"
                  name="file"
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  required
                  onChange={(e) =>
                    setFileName(e.target.files?.[0]?.name ?? "")
                  }
                />
                <Button type="submit" variant="primary" size="sm" disabled={pending}>
                  <Upload className="h-4 w-4" />
                  {pending ? "Procesando…" : "Subir"}
                </Button>
              </div>
              {fileName && (
                <p className="mt-1 text-[11px] opacity-60">
                  Archivo seleccionado:{" "}
                  <code className="font-mono">{fileName}</code>
                </p>
              )}
              <p className="mt-1 text-[11px] opacity-60">
                Tamaño máximo: 64 KB (un .p12 estándar ocupa &lt;10 KB).
              </p>
            </div>
            <div>
              <Label htmlFor="cert-password">Contraseña del certificado</Label>
              <Input
                id="cert-password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="off"
                required
                minLength={4}
              />
              <p className="mt-1 text-[11px] opacity-60">
                Se usa server-side para validar y luego se cifra con
                AES-256-GCM. Nunca se loguea.
              </p>
            </div>
            <p className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-70">
              <ShieldAlert className="mr-1 inline h-3 w-3" />
              Esta acción queda registrada en <code className="font-mono">audit_logs</code>{" "}
              con el id del usuario, fingerprint del cert y validity. Sin la
              contraseña ni contenido del blob.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Qué sigue después de Fase F</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="ml-5 list-disc space-y-1 text-sm opacity-80">
            <li>
              <strong>Fase G</strong> (envío real a testecf) requiere
              autorización explícita y un endpoint
              <code className="font-mono text-xs"> /api/dgii/invoices/[id]/send</code>{" "}
              que firma con el cert cargado.
            </li>
            <li>
              <strong>Fase H</strong> (TrackId / status) requiere el cron
              de polling y el endpoint de recepción.
            </li>
            <li>
              <strong>Producción fiscal</strong> requiere setear
              <code className="font-mono text-xs"> ambiente=ecf</code> y
              <code className="font-mono text-xs"> dgii_enabled_real_send=true</code>{" "}
              después de 7+ días sin incidentes en
              <code className="font-mono text-xs"> testecf</code>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function CertDetails({ cert }: { cert: PublicCertificate }) {
  return (
    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
      <Row label="Sujeto" value={cert.subjectDn} />
      <Row label="Emisor" value={cert.issuerDn} />
      <Row label="Serial" value={cert.serialNumber} />
      <Row
        label="Fingerprint (SHA-256)"
        value={cert.fingerprintShort}
        mono
      />
      <Row
        label="Vigencia"
        value={`${cert.validFrom.slice(0, 10)} → ${cert.validTo.slice(0, 10)}`}
      />
      {cert.rncEmisor && <Row label="RNC emisor" value={cert.rncEmisor} />}
      <Row
        label="Subido"
        value={new Date(cert.uploadedAt).toLocaleString("es-DO")}
      />
    </dl>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider opacity-60">{label}</dt>
      <dd className={mono ? "mt-0.5 font-mono" : "mt-0.5"}>{value}</dd>
    </div>
  );
}
