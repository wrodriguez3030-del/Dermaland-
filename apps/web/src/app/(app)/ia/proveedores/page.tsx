"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Sparkles, Plug, Play, Pause, Trash2, Activity } from "lucide-react";
import {
  useProviders,
  aiApi,
  PROVIDER_STATUS_LABEL,
  type ProviderView,
} from "@/features/ai/ai-client";
import { ProviderWizard } from "@/features/ai/provider-wizard";
import { AiSetupGuide } from "@/features/ai/setup-guide";

const STATUS_TONE: Record<ProviderView["status"], "success" | "danger" | "warning" | "neutral"> = {
  unconfigured: "neutral",
  connected: "success",
  error: "danger",
  paused: "warning",
  limit_reached: "warning",
};

const CATALOG = [
  { type: "openai", name: "OpenAI", available: true, desc: "Plataforma API de OpenAI (GPT-5.4, gpt-5.4-mini…)." },
  { type: "openai_compatible", name: "Compatible con OpenAI", available: true, desc: "Servicios con API estilo OpenAI (base URL propia)." },
  { type: "anthropic", name: "Anthropic", available: false, desc: "Claude — próximamente." },
  { type: "google", name: "Google Gemini", available: false, desc: "Gemini — próximamente." },
  { type: "local", name: "Modelo local", available: false, desc: "Ollama/vLLM — próximamente." },
];

export default function ProveedoresPage() {
  const toast = useToast();
  const { providers, loading, unavailable, refresh } = useProviders();
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Error."); }
  };

  return (
    <>
      <PageHeader
        title="Proveedores de IA"
        description="Conecta DermaLand con un proveedor de inteligencia artificial. La API key se cifra en el servidor y nunca se muestra."
        breadcrumbs={[{ label: "IA", href: "/ia" }, { label: "Proveedores de IA" }]}
        actions={
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plug className="h-4 w-4" /> Conectar proveedor
          </Button>
        }
      />

      {unavailable && (
        <Card className="mb-4">
          <CardContent className="p-4 text-sm text-amber-800">
            El módulo de IA requiere Supabase activo. En modo local no se pueden
            guardar proveedores.
          </CardContent>
        </Card>
      )}

      <AiSetupGuide />

      {/* Configurados */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4 text-[color:var(--brand-accent)]" />
                    {p.displayName}
                  </div>
                  <div className="text-xs opacity-60">
                    {p.providerType === "openai" ? "OpenAI" : p.providerType === "openai_compatible" ? "Compatible con OpenAI" : p.providerType}
                    {p.hasKey ? ` · clave ••••${p.keyLastFour}` : " · sin clave"}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{PROVIDER_STATUS_LABEL[p.status]}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="opacity-60">Modelo</dt><dd className="text-right">{p.defaultModel ?? "—"}</dd>
                <dt className="opacity-60">Última prueba</dt><dd className="text-right">{p.lastTestedAt ? new Date(p.lastTestedAt).toLocaleString() : "—"}</dd>
                <dt className="opacity-60">Latencia</dt><dd className="text-right">{p.lastTestLatencyMs != null ? `${p.lastTestLatencyMs} ms` : "—"}</dd>
                <dt className="opacity-60">Límite mensual</dt><dd className="text-right">{p.monthlyBudgetUsd != null ? `US$${p.monthlyBudgetUsd}` : p.monthlyRequestLimit != null ? `${p.monthlyRequestLimit} req` : "sin tope"}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => act(() => aiApi.testProvider(p.id).then((r) => { if (!r.result.ok) throw new Error(r.result.message); }), "Proveedor conectado correctamente.")}>
                  <Activity className="h-3.5 w-3.5" /> Probar
                </Button>
                {p.status === "paused" ? (
                  <Button size="sm" variant="outline" onClick={() => act(() => aiApi.updateProvider(p.id, { status: "connected" }), "Proveedor activado.")}>
                    <Play className="h-3.5 w-3.5" /> Activar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => act(() => aiApi.updateProvider(p.id, { status: "paused" }), "Proveedor pausado.")}>
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`¿Eliminar la configuración de ${p.displayName}? La clave cifrada se borra.`)) void act(() => aiApi.deleteProvider(p.id), "Configuración eliminada."); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && providers.length === 0 && !unavailable && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="p-6 text-center text-sm opacity-70">
              Aún no hay proveedores configurados. Pulsa <strong>Conectar proveedor</strong> para empezar con OpenAI.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Catálogo */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Proveedores disponibles</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CATALOG.map((c) => (
          <Card key={c.type} className={c.available ? "" : "opacity-60"}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{c.name}</div>
                <Badge tone={c.available ? "info" : "neutral"}>{c.available ? "Disponible" : "Próximamente"}</Badge>
              </div>
              <p className="mt-1 text-xs opacity-60">{c.desc}</p>
              {c.available && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setWizardOpen(true)}>
                  Configurar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs opacity-60">
        Después de conectar un proveedor, ve a{" "}
        <Link href="/ia" className="underline">IA &gt; Agentes IA</Link> para asignarlo a cada agente y probarlo.
      </p>

      <ProviderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onSaved={() => void refresh()} />
      <toast.Toast />
    </>
  );
}
