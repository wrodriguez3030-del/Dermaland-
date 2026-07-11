"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { MessageSquare, Coins, AlertTriangle, Timer } from "lucide-react";
import { mockAILogs, mockAIAgents } from "@/lib/mock-data/integrations";
import { formatDateTime } from "@/lib/utils/format";
import { useAiUsage } from "@/features/ai/ai-client";

const AGENT_NAME = new Map(mockAIAgents.map((a) => [a.id, a.name]));

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  success: "success",
  fallback: "warning",
  timeout: "danger",
  rate_limited: "warning",
  error: "danger",
};

export default function IALogsPage() {
  // Consumo REAL del mes (ai_usage_logs). Si el backend no está disponible o
  // aún no hay actividad, se muestra la demo mock claramente etiquetada.
  const { summary, logs, loading } = useAiUsage();
  const hasReal = !!logs && logs.length > 0;

  return (
    <>
      <PageHeader
        title="Logs y costos IA"
        description="Consumo del mes por solicitud: tokens, costo estimado, latencia y errores."
        breadcrumbs={[{ label: "IA", href: "/ia" }, { label: "Logs y costos" }]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solicitudes (mes)"
          value={summary ? summary.requests : "—"}
          icon={MessageSquare}
          tone="primary"
        />
        <StatCard
          label="Tokens (entrada / salida)"
          value={summary ? `${summary.inputTokens} / ${summary.outputTokens}` : "—"}
          icon={Timer}
        />
        <StatCard
          label="Costo estimado (mes)"
          value={summary ? `US$${summary.estimatedCostUsd.toFixed(4)}` : "—"}
          icon={Coins}
        />
        <StatCard
          label="Errores / Latencia prom."
          value={summary ? `${summary.errors} · ${summary.avgLatencyMs} ms` : "—"}
          icon={AlertTriangle}
          tone={summary && summary.errors > 0 ? "warning" : undefined}
        />
      </div>

      {hasReal ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Agente</TH>
                  <TH>Proveedor / Modelo</TH>
                  <TH className="text-right">Tokens (in/out)</TH>
                  <TH className="text-right">Costo</TH>
                  <TH className="text-right">Latencia</TH>
                  <TH>Tools</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {logs!.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                    <TD className="text-sm">{l.agentId ? AGENT_NAME.get(l.agentId) ?? l.agentId : "—"}</TD>
                    <TD className="text-xs font-mono">
                      {l.providerType ?? "—"}{l.model ? ` · ${l.model}` : ""}
                      {l.wasFallback && <Badge tone="warning" outlined> fallback</Badge>}
                    </TD>
                    <TD className="text-right tabular-nums text-xs">{l.inputTokens} / {l.outputTokens}</TD>
                    <TD className="text-right tabular-nums text-xs">US${l.estimatedCostUsd.toFixed(4)}</TD>
                    <TD className="text-right tabular-nums text-xs">{l.latencyMs != null ? `${l.latencyMs} ms` : "—"}</TD>
                    <TD className="text-xs">
                      {l.toolsUsed.length > 0
                        ? l.toolsUsed.map((t) => (
                            <code key={t} className="mr-1 rounded bg-black/5 px-1 py-0.5 font-mono text-[10px]">{t}</code>
                          ))
                        : "—"}
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[l.status] ?? "info"}>{l.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="p-4 text-sm opacity-70">
              {loading
                ? "Cargando actividad…"
                : "Aún no hay solicitudes reales de IA este mes. Cuando un agente responda (o lo pruebes desde Agentes IA), cada solicitud aparecerá aquí con sus tokens, costo y latencia. Abajo: datos de ejemplo."}
            </CardContent>
          </Card>
          {!loading && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Fecha</TH>
                      <TH>Agente</TH>
                      <TH>Tool</TH>
                      <TH>Estado</TH>
                      <TH className="text-right">Duración</TH>
                      <TH className="text-right">Costo USD</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {mockAILogs.map((l) => (
                      <TR key={l.id} className="opacity-60">
                        <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                        <TD className="text-sm">{l.agentName} <span className="text-[10px] opacity-60">(ejemplo)</span></TD>
                        <TD>
                          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">{l.tool}</code>
                        </TD>
                        <TD>
                          <Badge tone={l.status === "success" ? "success" : l.status === "handoff" ? "warning" : "danger"}>
                            {l.status}
                          </Badge>
                        </TD>
                        <TD className="text-right tabular-nums">{l.durationMs} ms</TD>
                        <TD className="text-right tabular-nums">${l.costUSD.toFixed(4)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
