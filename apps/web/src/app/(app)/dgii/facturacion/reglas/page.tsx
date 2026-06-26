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
import { BillingDgiiWarning } from "@/components/dgii/billing-warning";
import { CreditCard, Banknote, ArrowLeftRight, Layers, FileText, Lock, Settings } from "lucide-react";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import { summarizeBillingRules } from "@/features/billing/auto-billing-rules";
import { canEditBillingRules } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";

/**
 * DGII / Facturación → Reglas automáticas de e-CF.
 *
 * Muestra las reglas A-E de forma clara y enlaza a Configuración para editarlas
 * (solo ADMIN). Esta pantalla es de lectura + acceso rápido a la edición.
 */
const RULE_ICON: Record<string, typeof CreditCard> = {
  card: CreditCard,
  cash: Banknote,
  transfer: ArrowLeftRight,
  mixed: Layers,
  proforma: FileText,
};

const BADGE: Record<
  "ecf_immediate" | "at_closing" | "proforma",
  { tone: "neutral" | "warning" | "success" | "danger"; text: string }
> = {
  ecf_immediate: { tone: "success", text: "e-CF inmediato" },
  at_closing: { tone: "warning", text: "cierre de caja" },
  proforma: { tone: "neutral", text: "no fiscal" },
};

export default function BillingRulesPage() {
  const settings = useBillingSettings();
  const rules = summarizeBillingRules(settings);
  const isAdmin = canEditBillingRules(mockCurrentUser.role);

  return (
    <>
      <PageHeader
        title="Reglas automáticas de e-CF"
        description="Cómo se factura según el método de pago. Solo ADMIN puede editar."
        breadcrumbs={[
          { label: "DGII / Facturación", href: "/dgii" },
          { label: "Reglas automáticas de e-CF" },
        ]}
        actions={
          <Link href="/dgii/facturacion/configuracion">
            <Button size="sm" variant="outline">
              <Settings className="h-4 w-4" /> Editar configuración
            </Button>
          </Link>
        }
      />

      <BillingDgiiWarning />

      {!isAdmin && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm">
          <Lock className="h-4 w-4 opacity-60" />
          Solo lectura: tu rol no puede editar las reglas automáticas. Puedes ver
          el porcentaje configurado y la estrategia.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => {
          const Icon = RULE_ICON[rule.id] ?? FileText;
          const badge = BADGE[rule.badge];
          return (
            <Card key={rule.id}>
              <CardContent className="flex gap-3 pt-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{rule.title}</h3>
                    <div className="flex items-center gap-1">
                      <Badge tone={badge.tone}>{badge.text}</Badge>
                      <Badge tone={rule.enabled ? "success" : "neutral"}>
                        {rule.enabled ? "activa" : "inactiva"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed opacity-70">
                    {rule.detail}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Parámetros vigentes (solo ADMIN puede cambiarlos)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Param
              label="% e-CF efectivo/transferencia"
              value={`${settings.cashTransferEcfPercentage}%`}
            />
            <Param
              label="Estrategia de selección"
              value={
                settings.cashTransferSelectionStrategy === "last"
                  ? "Últimas ventas"
                  : settings.cashTransferSelectionStrategy === "first"
                    ? "Primeras ventas"
                    : "Selección manual"
              }
            />
            <Param
              label="Tipo consumidor final"
              value={settings.defaultConsumerEcfType}
            />
            <Param label="Tipo cliente con RNC" value={settings.defaultRncEcfType} />
          </dl>
          <p className="mt-4 text-xs opacity-60">
            Solo ADMIN puede editar: regla de tarjeta inmediata, regla de cierre,
            porcentaje e-CF efectivo/transferencia, tipos por defecto y estrategia
            de selección.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
      <dt className="text-[10px] uppercase tracking-wider opacity-60">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
