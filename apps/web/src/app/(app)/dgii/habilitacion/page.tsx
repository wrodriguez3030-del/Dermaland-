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
} from "@/components/ui";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  PlayCircle,
  ListChecks,
} from "lucide-react";
import { EnablementStepCard } from "@/components/dgii/enablement-step-card";
import { EnablementStatusBadge } from "@/components/dgii/enablement-status-badge";
import {
  dgiiEnablementSteps,
  dgiiEnablementServiceUrls,
  dgiiEnablementBaseUrl,
  dgiiEnablementRelevantPermissions,
} from "@/lib/mock-data/dgii-enablement";
import {
  useEnablementProgress,
  resetEnablement,
} from "@/features/dgii/enablement-store";
import { useSyncedCertificate } from "@/features/dgii/use-synced-certificate";
import {
  evaluateEnablement,
  ENABLEMENT_GLOBAL_STATUS_LABEL,
  ENABLEMENT_GLOBAL_STATUS_TONE,
  type EnablementEvaluation,
} from "@/features/dgii/enablement-evaluator";

/**
 * Habilitación Facturación Electrónica DGII — wizard SaaS para clientes.
 *
 * 10 pasos en orden:
 *  1. Certificado digital   2. Configuración fiscal   3. Postulación
 *  4. Pruebas e-CF          5. Representaciones        6. URL servicios
 *  7. Declaración jurada    8. Autorización representante e-CF
 *  9. Roles y NCF          10. Estado final
 *
 * Modo SaaS: cada cliente DermaLand opera en su propio business_id;
 * certificado, secuencias, auditoría y permisos están aislados por
 * RLS en Supabase. El wizard nunca cruza datos entre clientes.
 *
 * Persiste el progreso en localStorage (por browser del usuario; se
 * migrará a tabla `dgii_enablement_progress` con RLS cuando se mueva
 * de cliente-only a multi-device). NO contacta DGII, NO firma con
 * certificado real en este wizard.
 */
export default function DgiiHabilitacionPage() {
  const progressList = useEnablementProgress();
  const certificate = useSyncedCertificate();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [evaluation, setEvaluation] =
    React.useState<EnablementEvaluation | null>(null);

  // Auto-evaluar siempre que cambie progreso o certificado.
  React.useEffect(() => {
    setEvaluation(evaluateEnablement(progressList, certificate));
  }, [progressList, certificate]);

  const total = dgiiEnablementSteps.length; // 10 (9 accionables + estado_final)
  const actionableTotal = total - 1; // excluye estado_final → 9
  const completedCount = evaluation?.totals.completed ?? 0;
  const inProgressCount = evaluation?.totals.inProgress ?? 0;
  const blockedCount = evaluation?.totals.blocked ?? 0;
  const pendingCount = evaluation?.totals.pending ?? actionableTotal;
  const percent =
    actionableTotal === 0
      ? 0
      : Math.round((completedCount / actionableTotal) * 100);

  const runReview = () => {
    setEvaluation(evaluateEnablement(progressList, certificate));
  };

  const globalStatus = evaluation?.globalStatus ?? "not_started";
  const globalLabel = ENABLEMENT_GLOBAL_STATUS_LABEL[globalStatus];
  const globalTone = ENABLEMENT_GLOBAL_STATUS_TONE[globalStatus];

  return (
    <>
      <PageHeader
        title="Habilitación Facturación Electrónica DGII"
        description="Asistente paso a paso, estilo wizard, para dejar tu negocio listo para emitir e-CF. Modo MOCK / DEMO — no se envía nada a DGII."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Habilitación" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={runReview}>
              <PlayCircle className="h-4 w-4" />
              Ejecutar revisión de habilitación
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("¿Reiniciar progreso de habilitación?")) {
                  resetEnablement();
                }
              }}
              aria-label="Reiniciar progreso"
            >
              Reiniciar
            </Button>
          </div>
        }
      />

      {/* Aviso MOCK/DEMO/NO FISCAL persistente */}
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>MOCK / DEMO / NO FISCAL.</strong> Este wizard guía el
            proceso de habilitación. <em>No</em> envía postulación a DGII,
            <em> no</em> firma con certificado real, <em>no</em> consume
            secuencias reales y <em>no</em> cambia DNS. Cuando se autoricen
            Fases C/F/G/H, los pasos hoy en estado{" "}
            <code className="font-mono text-xs">blocked</code> se activan.
          </div>
        </div>
      </div>

      {/* Modo SaaS · aislamiento por business_id */}
      <div className="mb-6 rounded-2xl border border-sky-300 bg-sky-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-700" />
          <div className="text-sm text-sky-950">
            <strong>Modo SaaS · datos aislados por cliente.</strong> Cada
            negocio DermaLand opera bajo su propio <code className="font-mono text-xs">business_id</code>:
            certificado digital, secuencias e-NCF, configuración fiscal,
            permisos por rol y auditoría se aplican <em>solo</em> a tu
            negocio. Postgres Row-Level Security (RLS) garantiza que ningún
            usuario vea ni modifique datos de otro contribuyente — verificado
            con tests E2E que intentan cross-business inserts y son
            rechazados por la política.
          </div>
        </div>
      </div>

      {/* Panel global: Estado de habilitación DGII + Progreso + Próximo paso */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-[color:var(--brand-accent)]" />
              Estado de habilitación DGII
            </CardTitle>
            <p className="mt-1 text-sm opacity-60">
              Cálculo automático a partir del certificado y los 9 pasos
              accionables del wizard.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={globalTone} className="text-sm">
                {globalLabel}
              </Badge>
              <span className="text-xs opacity-60">
                Certificado:{" "}
                {certificate.status === "valid"
                  ? "válido"
                  : certificate.status === "uploaded"
                    ? "cargado"
                    : certificate.status === "expired"
                      ? "vencido"
                      : certificate.status === "invalid"
                        ? "inválido"
                        : "sin cargar"}
              </span>
            </div>
            <div className="mt-4 mb-2 h-3 overflow-hidden rounded-full bg-black/5">
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de habilitación DGII"
                className="h-full bg-[color:var(--brand-primary)] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs opacity-60">
              {completedCount} de {actionableTotal} pasos completados (
              {percent}%).
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="success">
                <CheckCircle2 className="h-3 w-3" />
                {completedCount} finalizados
              </Badge>
              <Badge tone="info">{inProgressCount} en progreso</Badge>
              <Badge tone="neutral">{pendingCount} pendientes</Badge>
              {blockedCount > 0 && (
                <Badge tone="danger">{blockedCount} bloqueados</Badge>
              )}
            </div>
            {evaluation?.evaluatedAt && (
              <p className="mt-3 text-[11px] opacity-50">
                Última evaluación:{" "}
                {new Date(evaluation.evaluatedAt).toLocaleString("es-DO")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximo paso recomendado</CardTitle>
          </CardHeader>
          <CardContent>
            {evaluation?.nextStep ? (
              <>
                <p className="text-sm font-medium">{evaluation.nextStep.title}</p>
                <p className="mt-1 text-xs opacity-60">
                  Paso {evaluation.nextStep.order} de {total}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setExpandedId(evaluation.nextStep!.id)}
                  >
                    Ver detalle
                  </Button>
                  <Link href={evaluation.nextStep.route}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4" />
                      Ir al módulo
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm opacity-70">
                Todos los pasos están en estado completado (mock). Recuerda
                validar con DGII y contador antes de Fase C/F/G/H.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resultado de la última revisión: diagnóstico por dimensión */}
      {evaluation && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[color:var(--brand-accent)]" />
              Revisión de habilitación
            </CardTitle>
            <p className="mt-1 text-sm opacity-60">
              Diagnóstico paso a paso (qué está completo, qué pendiente, qué
              bloqueado).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="divide-y divide-black/5 text-sm">
              {evaluation.diagnostics.map((d) => (
                <li key={d.stepId} className="flex items-start gap-3 py-2">
                  <span className="min-w-[160px]">
                    <EnablementStatusBadge status={d.status} />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs opacity-70">{d.summary}</p>
                    <p className="text-xs opacity-60">
                      Sugerencia: {d.recommendation}
                    </p>
                  </div>
                  {d.blocked && (
                    <Badge tone="warning" className="shrink-0 self-center">
                      bloqueo conocido
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              {evaluation.mockNotice}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Wizard 9 pasos */}
      <div className="space-y-3">
        {dgiiEnablementSteps.map((step) => {
          const progress = progressList.find((p) => p.stepId === step.id);
          const expanded = expandedId === step.id;

          if (step.id === "estado_final") {
            return (
              <Card
                key={step.id}
                className="overflow-hidden border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5"
              >
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/15 text-xs font-semibold text-[color:var(--brand-accent)]">
                        {step.order}
                      </span>
                      <div>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <span>{step.title}</span>
                          <Badge tone={globalTone}>{globalLabel}</Badge>
                        </CardTitle>
                        <p className="mt-1 text-sm opacity-70">
                          {step.description}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={runReview}>
                      <PlayCircle className="h-4 w-4" />
                      Refrescar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-black/5 bg-white p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-[color:var(--brand-accent)]" />
                      <div>
                        <p>
                          <strong>{globalLabel}.</strong> Próximo paso:{" "}
                          {evaluation?.nextStep
                            ? evaluation.nextStep.title
                            : "ninguno (todo completado en mock)"}
                          .
                        </p>
                        <p className="mt-1 text-xs opacity-70">
                          {evaluation?.mockNotice}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <EnablementStepCard
              key={step.id}
              step={step}
              progress={progress}
              expanded={expanded}
              onToggle={() => setExpandedId(expanded ? null : step.id)}
              certificate={
                step.id === "certificado_digital" ||
                step.id === "autorizacion_representante"
                  ? certificate
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Panel auxiliar: URLs planificadas (referencia para paso 6) */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            URLs de servicios DGII (planificadas)
          </CardTitle>
          <p className="mt-1 text-sm opacity-60">
            Base producción Vercel:{" "}
            <code className="rounded bg-black/5 px-1 font-mono text-xs">
              {dgiiEnablementBaseUrl}
            </code>
            . Endpoints internos en modo mock/stub. Las URLs no están
            registradas en DGII todavía.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-black/5 text-sm">
            {dgiiEnablementServiceUrls.map((url) => (
              <li key={url.path} className="flex items-center justify-between py-2">
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-xs">{url.path}</code>
                  <p className="text-xs opacity-60">{url.purpose}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge tone={url.state === "mock" ? "warning" : "neutral"}>
                    {url.state}
                  </Badge>
                  {url.blocked && (
                    <Badge tone="danger">requiere {url.blocked}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Permisos relevantes — referencia paso 8 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Permisos DGII / caja relevantes
          </CardTitle>
          <p className="mt-1 text-sm opacity-60">
            Estos permisos son los que tu contador/admin debe asignar al
            rol correspondiente. Hoy en modo mock — Fase C los hace
            obligatorios en runtime con RLS.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {dgiiEnablementRelevantPermissions.map((key) => (
              <code
                key={key}
                className="rounded bg-black/5 px-2 py-1 font-mono text-[11px]"
              >
                {key}
              </code>
            ))}
          </div>
          <Link href="/admin/permisos" className="mt-3 inline-block">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
              Ver catálogo completo
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Estados disponibles — leyenda */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Leyenda de estados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <EnablementStatusBadge status="pending" />
            <EnablementStatusBadge status="in_progress" />
            <EnablementStatusBadge status="completed" />
            <EnablementStatusBadge status="blocked" />
            <EnablementStatusBadge status="requires_user_action" />
            <EnablementStatusBadge status="requires_accountant_validation" />
            <EnablementStatusBadge status="requires_dgii_validation" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
