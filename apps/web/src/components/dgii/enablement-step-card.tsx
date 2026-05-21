"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Label,
} from "@/components/ui";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  Square,
  AlertTriangle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { EnablementStatusBadge, ENABLEMENT_STATUS_OPTIONS } from "./enablement-status-badge";
import {
  setStepStatus,
  toggleChecklistItem,
  type EnablementProgress,
  type EnablementStatus,
} from "@/features/dgii/enablement-store";
import type { EnablementStepDef } from "@/lib/mock-data/dgii-enablement";
import {
  CERTIFICATE_STATUS_LABEL,
  CERTIFICATE_STATUS_TONE,
  type CertificateMockState,
} from "@/features/dgii/certificate-status-store";
import { useLocalTest } from "@/features/dgii/local-test-store";

interface EnablementStepCardProps {
  step: EnablementStepDef;
  progress?: EnablementProgress;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Estado actual del certificado. Se usa para:
   *  - `certificado_digital`: panel de estado + acciones.
   *  - `autorizacion_representante`: pre-fill informativo (subject,
   *    issuer, vigencia) para que el usuario verifique titularidad.
   */
  certificate?: CertificateMockState;
}

export function EnablementStepCard({
  step,
  progress,
  expanded,
  onToggle,
  certificate,
}: EnablementStepCardProps) {
  const status: EnablementStatus = progress?.status ?? step.defaultStatus;
  const checklistFromStore = progress?.checklist ?? [];
  const isCertificateStep = step.id === "certificado_digital";
  const isRepresentanteStep = step.id === "autorizacion_representante";
  const certStatus = certificate?.status ?? "not_uploaded";
  const certLocked = certStatus === "not_uploaded";
  const certInvalid = certStatus === "expired" || certStatus === "invalid";
  const checklistItems = step.checklist.map((it) => ({
    ...it,
    done:
      checklistFromStore.find((c) => c.id === it.id)?.done ?? false,
  }));
  const doneCount = checklistItems.filter((c) => c.done).length;
  const totalCount = checklistItems.length;
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const handleStatus = (next: EnablementStatus) => {
    setStepStatus(step.id, next, {
      completedBy: "demo-user",
      blockerReason: next === "blocked" ? step.blockedReason : undefined,
    });
  };

  // Para el step "autorizacion_representante" leemos la evidencia de la
  // última prueba local de cert (run en /dgii/certificado → POST
  // /api/dgii/certificate/test-local). Si existe, mostramos campos
  // pre-extraídos del subject/issuer para ayudar al usuario a verificar
  // titularidad. Si no, lo invitamos a correr la prueba primero.
  const localTest = useLocalTest();
  const representanteHints = isRepresentanteStep
    ? representanteHintsFromEvidence(localTest)
    : null;

  const handleToggle = (itemId: string) => {
    if (!progress) {
      // Inicializar progreso si no existe — primer toggle crea el registro.
      setStepStatus(step.id, "in_progress", { completedBy: "demo-user" });
      // Aplicar el toggle después de inicializar.
      toggleChecklistItem(step.id, itemId);
      return;
    }
    toggleChecklistItem(step.id, itemId);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`step-${step.id}-content`}
            className="flex flex-1 items-start gap-3 text-left"
          >
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/15 text-xs font-semibold text-[color:var(--brand-accent)]">
              {step.order}
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>{step.title}</span>
                <EnablementStatusBadge status={status} />
                {step.requiresAccountant && (
                  <Badge tone="purple" className="text-[10px]">
                    contador
                  </Badge>
                )}
                {step.requiresDgii && (
                  <Badge tone="warning" className="text-[10px]">
                    DGII real
                  </Badge>
                )}
              </CardTitle>
              <p className="mt-1 text-sm opacity-70">{step.description}</p>
              <div className="mt-2 flex items-center gap-2 text-xs opacity-60">
                <span>
                  {doneCount}/{totalCount} items
                </span>
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-black/5">
                  <span
                    className="block h-full bg-[color:var(--brand-primary)] transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span>{percent}%</span>
              </div>
            </div>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={expanded ? "Colapsar paso" : "Expandir paso"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent id={`step-${step.id}-content`} className="space-y-4">
          {isCertificateStep && certificate && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                certInvalid
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : certLocked
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-emerald-300 bg-emerald-50 text-emerald-900"
              }`}
            >
              <div className="flex items-start gap-2">
                {certLocked || certInvalid ? (
                  <ShieldOff className="mt-0.5 h-4 w-4" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4" />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>Estado del certificado:</strong>
                    <Badge tone={CERTIFICATE_STATUS_TONE[certStatus]}>
                      {CERTIFICATE_STATUS_LABEL[certStatus]}
                    </Badge>
                    {certificate.alias && (
                      <span className="opacity-70">· {certificate.alias}</span>
                    )}
                    {certificate.validTo && (
                      <span className="opacity-70">
                        · vence {certificate.validTo}
                      </span>
                    )}
                  </div>
                  {certLocked && (
                    <p className="mt-1">
                      <strong>Bloqueo:</strong> sin certificado no se puede
                      firmar XAdES-BES ni avanzar la habilitación.
                    </p>
                  )}
                  {certInvalid && (
                    <p className="mt-1">
                      <strong>Acción requerida:</strong> renovar o reemplazar
                      el certificado. La firma queda inhabilitada.
                    </p>
                  )}
                  <p className="mt-1 opacity-80">
                    Seguridad: la contraseña del certificado nunca se imprime
                    ni se guarda en texto. Modo MOCK / DEMO — no se procesa
                    un archivo `.p12` real.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Link href="/dgii/certificado">
                  <Button size="sm">
                    <ExternalLink className="h-4 w-4" />
                    {certLocked ? "Ir a subir certificado" : "Gestionar certificado"}
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {isRepresentanteStep && (
            <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                Datos sugeridos extraídos del certificado activo
              </p>
              {representanteHints ? (
                <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[160px_1fr]">
                  <dt className="opacity-60">Titular (CN):</dt>
                  <dd className="font-medium break-words">
                    {representanteHints.titular ?? "—"}
                  </dd>
                  <dt className="opacity-60">Cédula del titular:</dt>
                  <dd className="font-mono break-words">
                    {representanteHints.cedula ?? "—"}
                  </dd>
                  <dt className="opacity-60">RNC extraído del cert:</dt>
                  <dd className="font-mono break-words">
                    {representanteHints.rncEmisor ?? "—"}
                  </dd>
                  <dt className="opacity-60">Entidad certificadora:</dt>
                  <dd className="break-words">
                    {representanteHints.entidadCertificadora ?? "—"}
                  </dd>
                  <dt className="opacity-60">Vigencia:</dt>
                  <dd className="break-words">
                    {representanteHints.vigencia ?? "—"}
                  </dd>
                </dl>
              ) : (
                <p>
                  No hay evidencia de prueba local todavía. Andá a{" "}
                  <Link
                    href="/dgii/certificado"
                    className="underline underline-offset-2"
                  >
                    /dgii/certificado
                  </Link>{" "}
                  y ejecutá la prueba local del certificado primero — vamos a
                  pre-llenar estos datos para que sea más fácil verificar
                  titularidad.
                </p>
              )}
              <p className="mt-2 text-[11px] opacity-70">
                Estos valores son <strong>sugerencias</strong> derivadas del
                cert; el contador o representante autorizado debe confirmar
                con la designación oficial e-CF. <strong>Fase G permanece
                bloqueada</strong> hasta marcar todos los items del checklist.
              </p>
            </div>
          )}

          {step.blockedReason && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  <strong>Bloqueo conocido:</strong> {step.blockedReason}
                </span>
              </div>
            </div>
          )}

          {step.readOnly ? (
            <div className="rounded-xl border border-black/5 bg-black/[0.02] p-3 text-sm opacity-80">
              <p className="font-medium">Resumen automático del wizard.</p>
              <p className="mt-1 text-xs opacity-70">
                Este paso no tiene checklist manual: el estado se calcula a
                partir del avance de los 9 pasos accionables y del certificado
                digital. Usa el botón <strong>“Ejecutar revisión de
                habilitación”</strong> en la cabecera para refrescarlo.
              </p>
            </div>
          ) : (
            <>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                  Checklist
                </h4>
                <ul className="space-y-1">
                  {checklistItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleToggle(item.id)}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/[0.03]"
                        aria-pressed={item.done}
                      >
                        {item.done ? (
                          <Check
                            className="mt-0.5 h-4 w-4 text-emerald-600"
                            aria-hidden
                          />
                        ) : (
                          <Square
                            className="mt-0.5 h-4 w-4 opacity-30"
                            aria-hidden
                          />
                        )}
                        <span
                          className={
                            item.done
                              ? "line-through opacity-50"
                              : "opacity-90"
                          }
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Estado del paso</Label>
                  <Select
                    value={status}
                    onChange={(e) =>
                      handleStatus(e.target.value as EnablementStatus)
                    }
                    aria-label={`Cambiar estado del paso ${step.title}`}
                  >
                    {ENABLEMENT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Link href={step.route} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4" />
                      Ir al módulo
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    onClick={() => handleStatus("completed")}
                    disabled={status === "completed"}
                  >
                    Marcar completado
                  </Button>
                </div>
              </div>
            </>
          )}

          {step.relatedRoutes && step.relatedRoutes.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                Módulos relacionados
              </h4>
              <div className="flex flex-wrap gap-2">
                {step.relatedRoutes.map((r) => (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="rounded-full border border-black/10 px-3 py-1 text-xs hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-accent)]"
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {progress?.completedAt && (
            <p className="text-xs opacity-60">
              Completado por <strong>{progress.completedBy ?? "—"}</strong> el{" "}
              {new Date(progress.completedAt).toLocaleString("es-DO")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface RepresentanteHints {
  titular?: string;
  cedula?: string;
  rncEmisor?: string;
  entidadCertificadora?: string;
  vigencia?: string;
}

/**
 * Extrae campos legibles desde la evidencia local del cert (último
 * `runLocalCertTest`). Es puro/best-effort: si el subject no incluye
 * cédula con prefijo `IDCDO-`, devuelve undefined en ese campo.
 */
export function representanteHintsFromEvidence(
  ev: ReturnType<typeof useLocalTest>,
): RepresentanteHints | null {
  if (!ev) return null;
  const subject = ev.certificate.subjectDn ?? "";
  const issuer = ev.certificate.issuerDn ?? "";
  const cn = subject
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.toLowerCase().startsWith("cn="))
    ?.replace(/^cn=/i, "")
    ?.trim();
  const cedulaMatch = subject.match(/IDCDO-(\d{9,11})/i);
  const issuerOrg = issuer
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.toUpperCase().startsWith("O="))
    ?.replace(/^O=/i, "")
    ?.trim();
  const issuerCn = issuer
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.toLowerCase().startsWith("cn="))
    ?.replace(/^cn=/i, "")
    ?.trim();
  return {
    titular: cn,
    cedula: cedulaMatch ? cedulaMatch[1] : undefined,
    rncEmisor: ev.certificate.rncEmisor,
    entidadCertificadora: issuerOrg ?? issuerCn,
    vigencia:
      ev.certificate.validity === "valid"
        ? "vigente"
        : ev.certificate.validity === "expired"
          ? "vencido"
          : "inválido",
  };
}
