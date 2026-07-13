"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, Badge, Button, Input, Select, Label, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Bot, FlaskConical, MessageCircle } from "lucide-react";
import { useAgents, useProviders, aiApi, type AgentView } from "./ai-client";

/**
 * Panel de configuración de agentes: asigna proveedor/modelo a cada agente y
 * permite probarlo. Requiere Supabase; en modo local muestra aviso.
 */
export function AgentConfigPanel() {
  const toast = useToast();
  const { agents, loading, refresh } = useAgents();
  const { providers, unavailable } = useProviders();
  const [testAgent, setTestAgent] = React.useState<AgentView | null>(null);

  const connected = providers.filter((p) => p.status === "connected" || p.hasKey);

  const saveBinding = async (agentId: string, patch: Record<string, unknown>) => {
    try {
      await aiApi.updateAgent(agentId, patch);
      toast.success("Configuración del agente guardada.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar.");
    }
  };

  if (unavailable) {
    return (
      <Card><CardContent className="p-4 text-sm text-amber-800">
        La configuración de proveedores por agente requiere Supabase activo.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm opacity-60">Cargando agentes…</p>}
      {agents.map((a) => {
        const b = a.binding;
        const noProvider = !b?.providerId;
        return (
          <Card key={a.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4 text-[color:var(--brand-accent)]" /> {a.name}
                  {noProvider ? (
                    <Badge tone="warning">Configuración pendiente</Badge>
                  ) : b?.status === "paused" ? (
                    <Badge tone="neutral">Pausado</Badge>
                  ) : (
                    <Badge tone="success">Activo</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {!noProvider && (
                    <Link href={`/ia/chat?agent=${a.id}`}>
                      <Button size="sm">
                        <MessageCircle className="h-3.5 w-3.5" /> Chatear
                      </Button>
                    </Link>
                  )}
                  <Button size="sm" variant="outline" disabled={noProvider} onClick={() => setTestAgent(a)}>
                    <FlaskConical className="h-3.5 w-3.5" /> Probar agente
                  </Button>
                  {b?.status === "paused" ? (
                    <Button size="sm" variant="outline" onClick={() => saveBinding(a.id, { status: "active" })}>Activar</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => saveBinding(a.id, { status: "paused" })}>Pausar</Button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Proveedor</Label>
                  <Select
                    value={b?.providerId ?? ""}
                    onChange={(e) => saveBinding(a.id, { providerId: e.target.value || null })}
                  >
                    <option value="">— Selecciona —</option>
                    {connected.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Modelo</Label>
                  <Input
                    defaultValue={b?.model ?? ""}
                    placeholder="gpt-5.4-mini"
                    onBlur={(e) => { if (e.target.value !== (b?.model ?? "")) saveBinding(a.id, { model: e.target.value || null }); }}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs opacity-50">
                Herramientas: {a.toolsAllowed.join(", ")}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <TestPanel agent={testAgent} onClose={() => setTestAgent(null)} />
    </div>
  );
}

function TestPanel({ agent, onClose }: { agent: AgentView | null; onClose: () => void }) {
  const toast = useToast();
  const [message, setMessage] = React.useState("Hola, ¿en qué puedes ayudarme?");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof aiApi.testAgent>> | null>(null);

  React.useEffect(() => { if (agent) setResult(null); }, [agent]);

  const run = async () => {
    if (!agent) return;
    setRunning(true);
    try {
      const r = await aiApi.testAgent(agent.id, message);
      setResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo probar el agente.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={!!agent}
      title={`Probar agente · ${agent?.name ?? ""}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <Badge tone="info">Modo de prueba</Badge>
          <Button size="sm" onClick={run} disabled={running}>{running ? "Ejecutando…" : "Enviar"}</Button>
        </div>
      }
    >
      <div className="space-y-3 min-w-[min(30rem,80vw)]">
        <p className="text-xs opacity-60">Este modo NO envía mensajes reales por WhatsApp ni modifica datos.</p>
        <div>
          <Label>Mensaje de prueba</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {result && (
          <div className="space-y-2">
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm whitespace-pre-wrap">
              {result.text || "(sin texto)"}
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="opacity-60">Tokens entrada</dt><dd className="text-right">{result.usage.inputTokens}</dd>
              <dt className="opacity-60">Tokens salida</dt><dd className="text-right">{result.usage.outputTokens}</dd>
              <dt className="opacity-60">Costo estimado</dt><dd className="text-right">{result.estimatedCostUsd != null ? `US$${result.estimatedCostUsd.toFixed(6)}` : "—"}</dd>
              <dt className="opacity-60">Tiempo</dt><dd className="text-right">{result.latencyMs} ms</dd>
              {result.usedFallback && <><dt className="opacity-60">Fallback</dt><dd className="text-right">usado</dd></>}
            </dl>
          </div>
        )}
      </div>
    </Modal>
  );
}
