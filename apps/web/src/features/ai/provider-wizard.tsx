"use client";

import * as React from "react";
import { Button, Input, Select, Label, HelpText, Modal, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { aiApi, type ProviderView } from "./ai-client";

type Step = 1 | 2 | 3 | 4 | 5;

interface Draft {
  providerType: "openai" | "openai_compatible";
  displayName: string;
  apiKey: string;
  organizationId: string;
  projectId: string;
  baseUrl: string;
  defaultModel: string;
  economicalModel: string;
  reasoningModel: string;
  fallbackModel: string;
  monthlyRequestLimit: string;
  monthlyBudgetUsd: string;
  maxOutputTokens: string;
  timeoutMs: string;
  maxToolCalls: string;
  streamingEnabled: boolean;
  storeResponses: boolean;
}

const EMPTY: Draft = {
  providerType: "openai",
  displayName: "OpenAI",
  apiKey: "",
  organizationId: "",
  projectId: "",
  baseUrl: "",
  defaultModel: "gpt-4o-mini",
  economicalModel: "gpt-4o-mini",
  reasoningModel: "o4-mini",
  fallbackModel: "",
  monthlyRequestLimit: "",
  monthlyBudgetUsd: "",
  maxOutputTokens: "1024",
  timeoutMs: "30000",
  maxToolCalls: "5",
  streamingEnabled: true,
  storeResponses: false,
};

function numOrNull(s: string): number | null {
  const n = Number(s);
  return s.trim() && !Number.isNaN(n) ? n : null;
}

export function ProviderWizard({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: ProviderView) => void;
}) {
  const toast = useToast();
  const [step, setStep] = React.useState<Step>(1);
  const [d, setD] = React.useState<Draft>(EMPTY);
  const [providerId, setProviderId] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string; latencyMs: number } | null>(null);
  const [models, setModels] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  React.useEffect(() => {
    if (open) {
      setStep(1); setD(EMPTY); setProviderId(null); setTestResult(null); setModels([]);
    }
  }, [open]);

  // Crea (o actualiza clave) y prueba la conexión.
  const testConnection = async () => {
    if (!d.apiKey.trim() && !providerId) {
      toast.error("Ingresa la API key para probar la conexión.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      let id = providerId;
      if (!id) {
        const { provider } = await aiApi.createProvider({
          providerType: d.providerType,
          displayName: d.displayName || "OpenAI",
          baseUrl: d.providerType === "openai_compatible" ? d.baseUrl || null : null,
          organizationId: d.organizationId || null,
          projectId: d.projectId || null,
          apiKey: d.apiKey,
        });
        id = provider.id;
        setProviderId(id);
      } else if (d.apiKey.trim()) {
        await aiApi.rotateKey(id, d.apiKey);
      }
      const { result } = await aiApi.testProvider(id);
      setTestResult(result);
      if (result.ok) toast.success("Proveedor conectado correctamente.");
      else toast.error(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo probar la conexión.");
    } finally {
      setTesting(false);
    }
  };

  const syncModels = async () => {
    if (!providerId) return;
    try {
      const { models } = await aiApi.listModels(providerId);
      setModels(models.map((m) => m.id));
      toast.success(`${models.length} modelos disponibles.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron sincronizar los modelos.");
    }
  };

  const saveAndActivate = async () => {
    if (!providerId) { toast.error("Prueba la conexión antes de guardar."); return; }
    setSaving(true);
    try {
      const { provider } = await aiApi.updateProvider(providerId, {
        displayName: d.displayName,
        defaultModel: d.defaultModel || null,
        economicalModel: d.economicalModel || null,
        reasoningModel: d.reasoningModel || null,
        fallbackModel: d.fallbackModel || null,
        monthlyRequestLimit: numOrNull(d.monthlyRequestLimit),
        monthlyBudgetUsd: numOrNull(d.monthlyBudgetUsd),
        maxOutputTokens: numOrNull(d.maxOutputTokens),
        timeoutMs: numOrNull(d.timeoutMs),
        maxToolCalls: numOrNull(d.maxToolCalls),
        streamingEnabled: d.streamingEnabled,
        storeResponses: d.storeResponses,
        status: testResult?.ok ? "connected" : "unconfigured",
      });
      toast.success("Proveedor guardado y activado.");
      onSaved(provider);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const canNext =
    step === 1 ? true :
    step === 2 ? !!testResult?.ok :
    step === 3 ? !!d.defaultModel :
    true;

  return (
    <Modal
      open={open}
      title={`Conectar proveedor · Paso ${step} de 5`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={() => (step > 1 ? setStep((step - 1) as Step) : onClose())}>
            {step > 1 ? "Atrás" : "Cancelar"}
          </Button>
          {step < 5 ? (
            <Button size="sm" disabled={!canNext} onClick={() => setStep((step + 1) as Step)}>
              Continuar
            </Button>
          ) : (
            <Button size="sm" disabled={saving || !providerId} onClick={saveAndActivate}>
              {saving ? "Guardando…" : "Guardar y activar"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 min-w-[min(30rem,80vw)]">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm opacity-70">Elige el proveedor de inteligencia artificial.</p>
            {([
              { v: "openai", label: "OpenAI", desc: "Plataforma API de OpenAI (no confundir con ChatGPT app)." },
              { v: "openai_compatible", label: "Compatible con OpenAI", desc: "Otro servicio que expone la API estilo OpenAI (base URL propia)." },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => { set("providerType", o.v); if (o.v === "openai") set("baseUrl", ""); }}
                className={`w-full rounded-lg border p-3 text-left text-sm ${d.providerType === o.v ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-primary)]/5" : "border-black/10"}`}
              >
                <div className="font-medium">{o.label}</div>
                <div className="text-xs opacity-60">{o.desc}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label>Nombre de la conexión</Label>
              <Input value={d.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="OpenAI producción" />
            </div>
            {d.providerType === "openai_compatible" && (
              <div>
                <Label>Base URL</Label>
                <Input value={d.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://tu-servicio/v1" />
              </div>
            )}
            <div>
              <Label>API key {providerId && !d.apiKey ? "(guardada)" : ""}</Label>
              <Input
                type="password"
                autoComplete="off"
                value={d.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder={providerId ? "•••• (deja vacío para no cambiarla)" : "sk-…"}
              />
              <HelpText>La clave se cifra en el servidor y nunca se muestra completa ni vuelve al navegador.</HelpText>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Project ID (opcional)</Label>
                <Input value={d.projectId} onChange={(e) => set("projectId", e.target.value)} placeholder="proj_…" />
              </div>
              <div>
                <Label>Organization ID (opcional)</Label>
                <Input value={d.organizationId} onChange={(e) => set("organizationId", e.target.value)} placeholder="org-…" />
              </div>
              <HelpText className="col-span-2">
                Déjalos vacíos si no los conoces — NO es el nombre de tu empresa.
                Son IDs técnicos de OpenAI (empiezan con «proj_» y «org-»).
              </HelpText>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? "Probando…" : "Probar conexión"}
              </Button>
              {testResult && (
                <Badge tone={testResult.ok ? "success" : "danger"}>
                  {testResult.ok ? `Conectado · ${testResult.latencyMs} ms` : testResult.message}
                </Badge>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm opacity-70">Modelos por rol. Puedes escribir un model ID avanzado.</p>
              <Button size="sm" variant="outline" onClick={syncModels}>Sincronizar modelos</Button>
            </div>
            {([
              ["defaultModel", "Modelo predeterminado"],
              ["economicalModel", "Modelo económico"],
              ["reasoningModel", "Modelo de razonamiento"],
              ["fallbackModel", "Modelo alternativo (opcional)"],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <Label>{label}</Label>
                <Input list="ai-models" value={d[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
            <datalist id="ai-models">
              {models.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Límite mensual de solicitudes</Label><Input type="number" value={d.monthlyRequestLimit} onChange={(e) => set("monthlyRequestLimit", e.target.value)} placeholder="ej. 5000" /></div>
            <div><Label>Límite mensual estimado (USD)</Label><Input type="number" value={d.monthlyBudgetUsd} onChange={(e) => set("monthlyBudgetUsd", e.target.value)} placeholder="ej. 50" /></div>
            <div><Label>Máx. tokens de salida</Label><Input type="number" value={d.maxOutputTokens} onChange={(e) => set("maxOutputTokens", e.target.value)} /></div>
            <div><Label>Timeout (ms)</Label><Input type="number" value={d.timeoutMs} onChange={(e) => set("timeoutMs", e.target.value)} /></div>
            <div><Label>Máx. llamadas de herramientas</Label><Input type="number" value={d.maxToolCalls} onChange={(e) => set("maxToolCalls", e.target.value)} /></div>
            <div className="col-span-2 flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.streamingEnabled} onChange={(e) => set("streamingEnabled", e.target.checked)} /> Permitir streaming</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.storeResponses} onChange={(e) => set("storeResponses", e.target.checked)} /> Guardar respuestas en proveedor</label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2 text-sm">
            <Row k="Proveedor" v={d.providerType === "openai" ? "OpenAI" : "Compatible con OpenAI"} />
            <Row k="Conexión" v={d.displayName} />
            <Row k="Modelo predeterminado" v={d.defaultModel || "—"} />
            <Row k="Límite mensual" v={d.monthlyRequestLimit ? `${d.monthlyRequestLimit} solicitudes` : "sin límite"} />
            <Row k="Presupuesto" v={d.monthlyBudgetUsd ? `US$${d.monthlyBudgetUsd}` : "sin tope"} />
            <Row k="Prueba de conexión" v={testResult?.ok ? `OK (${testResult.latencyMs} ms)` : "pendiente"} />
            <p className="pt-2 text-xs opacity-60">Los agentes podrán conectarse a este proveedor desde IA &gt; Agentes IA.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-black/5 py-1">
      <span className="opacity-60">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
