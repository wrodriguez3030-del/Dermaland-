"use client";

import * as React from "react";
import { StatCard } from "@/components/ui/stat-card";
import { Bot, AlertTriangle, Coins, MessageSquare } from "lucide-react";
import { useAiUsage, useAiStatus } from "./ai-client";

/**
 * KPIs del overview de IA. Usa el consumo REAL del mes (ai_usage_logs) cuando
 * está disponible; si no (modo local / sin actividad), cae a los valores demo
 * que recibe por props.
 */
export function AiKpis({
  fallbackCalls,
  fallbackCost,
  fallbackHandoffs,
  fallbackActive,
}: {
  fallbackCalls: number;
  fallbackCost: number;
  fallbackHandoffs: number;
  fallbackActive: number;
}) {
  const { summary } = useAiUsage();
  const { status } = useAiStatus();
  const real = summary != null;

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={real ? "Solicitudes (mes)" : "Llamadas (mes, ejemplo)"}
        value={real ? summary.requests : fallbackCalls}
        icon={MessageSquare}
        tone="primary"
      />
      <StatCard
        label={real ? "Costo estimado (mes)" : "Costo (USD, ejemplo)"}
        value={real ? `US$${summary.estimatedCostUsd.toFixed(4)}` : `$${fallbackCost.toFixed(4)}`}
        icon={Coins}
      />
      <StatCard
        label={real ? "Errores (mes)" : "Handoffs a humano (ejemplo)"}
        value={real ? summary.errors : fallbackHandoffs}
        icon={AlertTriangle}
        tone={real && summary.errors > 0 ? "warning" : undefined}
      />
      <StatCard
        label="Agentes configurados"
        value={status ? `${status.agentsConfigured} / ${status.agentsTotal}` : fallbackActive}
        icon={Bot}
      />
    </div>
  );
}
