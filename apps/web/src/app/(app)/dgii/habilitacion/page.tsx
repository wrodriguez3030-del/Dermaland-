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
  Sparkles,
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
  computeProgressPercent,
  resetEnablement,
  type EnablementStatus,
} from "@/features/dgii/enablement-store";

/**
 * Habilitación Facturación Electrónica DGII (wizard mock).
 *
 * Wizard/checklist vertical con los 6 pasos del proceso de habilitación
 * ante DGII. Persiste el progreso en localStorage. NO contacta DGII,
 * NO toca Supabase real, NO firma con certificado real. Todas las
 * acciones marcables son ejercicios para el equipo del negocio.
 */
export default function DgiiHabilitacionPage() {
  const progressList = useEnablementProgress();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const total = dgiiEnablementSteps.length;
  const percent = computeProgressPercent(total, progressList);
  const completedCount = progressList.filter(
    (p) => p.status === "completed",
  ).length;
  const inProgressCount = progressList.filter(
    (p) => p.status === "in_progress",
  ).length;
  const blockedCount = progressList.filter(
    (p) => p.status === "blocked",
  ).length;
  const pendingCount = total - completedCount - inProgressCount - blockedCount;

  const nextStep = dgiiEnablementSteps.find((s) => {
    const p = progressList.find((pp) => pp.stepId === s.id);
    const status: EnablementStatus = p?.status ?? s.defaultStatus;
    return status !== "completed";
  });

  return (
    <>
      <PageHeader
        title="Habilitación Facturación Electrónica DGII"
        description="Asistente paso a paso para dejar tu negocio listo para emitir e-CF. Modo mock: no se envía nada a DGII."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Habilitación" },
        ]}
        actions={
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
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Asistente mock / demo / no fiscal.</strong> Este wizard
            es una guía interna. No envía postulación a DGII, no firma
            con certificado real, no consume secuencias reales y no
            cambia DNS. Cuando se autorice Fase C/G/H, los pasos que hoy
            quedan en estado <code className="font-mono text-xs">blocked</code>{" "}
            se activan automáticamente.
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[color:var(--brand-accent)]" />
              Progreso general
            </CardTitle>
            <p className="mt-1 text-sm opacity-60">
              {completedCount} de {total} pasos completados ({percent}%).
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 h-3 overflow-hidden rounded-full bg-black/5">
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
            <div className="flex flex-wrap gap-2 text-xs">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximo paso recomendado</CardTitle>
          </CardHeader>
          <CardContent>
            {nextStep ? (
              <>
                <p className="text-sm font-medium">{nextStep.title}</p>
                <p className="mt-1 text-xs opacity-60">
                  Paso {nextStep.order} de {total}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setExpandedId(nextStep.id)}
                  >
                    Ver detalle
                  </Button>
                  <Link href={nextStep.route}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4" />
                      Ir al módulo
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm opacity-70">
                ¡Todos los pasos están en estado completado en el sistema
                mock! Recuerda validar con DGII y contador antes de Fase C/G.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {dgiiEnablementSteps.map((step) => {
          const progress = progressList.find((p) => p.stepId === step.id);
          const expanded = expandedId === step.id;
          return (
            <EnablementStepCard
              key={step.id}
              step={step}
              progress={progress}
              expanded={expanded}
              onToggle={() => setExpandedId(expanded ? null : step.id)}
            />
          );
        })}
      </div>

      {/* Panel auxiliar: URLs planificadas (referencia para paso 4) */}
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

      {/* Permisos relevantes — referencia paso 6 */}
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
