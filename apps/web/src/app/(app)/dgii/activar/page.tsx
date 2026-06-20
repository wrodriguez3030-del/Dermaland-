"use client";

import * as React from "react";
import Link from "next/link";
import {
  KeyRound,
  FileSignature,
  CheckCircle2,
  Coins,
  Zap,
  ShieldCheck,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { useEnablementProgress } from "@/features/dgii/enablement-store";

type ActivationState =
  | "not_started"
  | "in_progress"
  | "cert_loaded"
  | "ready_testecf"
  | "active";

export default function ActivarFacturaElectronicaPage() {
  const progress = useEnablementProgress();

  const done = (id: string) =>
    progress.find((p) => p.stepId === id)?.status === "completed";
  const completedCount = progress.filter((p) => p.status === "completed").length;

  const state: ActivationState = done("estado_final")
    ? "active"
    : done("pruebas_ecf")
      ? "ready_testecf"
      : done("certificado_digital")
        ? "cert_loaded"
        : completedCount > 0
          ? "in_progress"
          : "not_started";

  const cta =
    state === "active"
      ? { label: "Ir al módulo DGII", href: "/dgii" }
      : state === "not_started"
        ? { label: "Comenzar", href: "/dgii/habilitacion" }
        : { label: "Continuar configuración", href: "/dgii/habilitacion" };

  return (
    <>
      <PageHeader
        title="Activar factura electrónica"
        description="Prepara tu empresa para la facturación electrónica e-CF de la DGII."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Activar" }]}
      />

      {/* Aviso de estado actual */}
      {state === "active" ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5" />
          <span>
            <strong>Facturación electrónica activa.</strong> Tu configuración e-CF
            está completa.
          </span>
        </div>
      ) : state === "ready_testecf" ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldCheck className="h-5 w-5" />
          <span>
            Tu configuración está lista para pruebas <strong>testecf</strong>,
            pendiente de autorización de la DGII.
          </span>
        </div>
      ) : state !== "not_started" ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 p-4 text-sm">
          <Badge tone="info">En preparación</Badge>
          <span className="opacity-80">
            Tienes configuración en progreso. Continúa donde la dejaste.
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Panel principal */}
        <Card>
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              ¡Pásate de forma voluntaria a la facturación electrónica y recibe{" "}
              <span className="text-[color:var(--brand-accent)]">beneficios</span>{" "}
              de la DGII!
            </h1>

            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider opacity-60">
                Requisitos previos para comenzar
              </h2>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div className="text-sm">
                    <div className="font-medium">
                      Usuario y contraseña del portal de certificación
                    </div>
                    <div className="opacity-60">
                      Credenciales de la oficina virtual DGII.
                    </div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                    <FileSignature className="h-5 w-5" />
                  </span>
                  <div className="text-sm">
                    <div className="font-medium">
                      Certificado de firma para procesos tributarios
                    </div>
                    <div className="opacity-60">
                      Archivo .p12 vigente a nombre de la empresa.
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href={cta.href}>
                <Button size="lg">
                  {cta.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link
                href="/dgii"
                className="inline-flex items-center gap-1 text-sm text-[color:var(--brand-accent)] hover:underline"
              >
                <HelpCircle className="h-4 w-4" /> Ayuda
              </Link>
            </div>

            <div className="mt-6 space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-xs opacity-80">
              <p>
                Este asistente te guiará para preparar tu empresa para facturación
                electrónica. <strong>No se enviará nada a DGII sin tu autorización.</strong>
              </p>
              <p>
                Hasta completar la certificación, los documentos generados son{" "}
                <strong>DEMO / NO FISCAL</strong>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Panel de beneficios */}
        <Card className="border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold">Beneficios</h2>
            <ul className="mt-4 space-y-4">
              <Benefit
                icon={Coins}
                title="Beneficios económicos"
                text="Recibirás certificados de créditos fiscales para aplicar en diversos impuestos."
              />
              <Benefit
                icon={Zap}
                title="Más agilidad"
                text="Flujos de trabajo más rápidos y transparentes."
              />
              <Benefit
                icon={ShieldCheck}
                title="Cumplimiento tributario óptimo"
                text="Evita errores y mantén tu contabilidad al día."
              />
            </ul>

            <div className="mt-6 border-t border-[color:var(--brand-primary)]/20 pt-4 text-xs opacity-70">
              <div className="mb-1 font-medium">Pasos del proceso</div>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li>Certificado digital</li>
                <li>Configuración fiscal</li>
                <li>Numeraciones e-NCF</li>
                <li>Pruebas testecf</li>
                <li>Autorización DGII</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Benefit({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--brand-accent)] shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-sm">
        <div className="font-semibold">{title}</div>
        <div className="opacity-70">{text}</div>
      </div>
    </li>
  );
}
