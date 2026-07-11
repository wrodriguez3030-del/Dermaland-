"use client";

import * as React from "react";

/**
 * Cliente del módulo de Proveedores de IA. Habla con `/api/ai/*`. NUNCA maneja
 * la API key en claro más allá de enviarla una vez al servidor (write-only): el
 * servidor la cifra y jamás la devuelve. No se guarda en localStorage.
 */

export interface ProviderView {
  id: string;
  providerType: "openai" | "openai_compatible" | "anthropic" | "google" | "local";
  displayName: string;
  status: "unconfigured" | "connected" | "error" | "paused" | "limit_reached";
  baseUrl: string | null;
  organizationId: string | null;
  projectId: string | null;
  defaultModel: string | null;
  economicalModel: string | null;
  reasoningModel: string | null;
  fallbackModel: string | null;
  monthlyRequestLimit: number | null;
  monthlyBudgetUsd: number | null;
  maxOutputTokens: number | null;
  maxToolCalls: number | null;
  timeoutMs: number | null;
  streamingEnabled: boolean;
  storeResponses: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestLatencyMs: number | null;
  hasKey: boolean;
  keyLastFour: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentBinding {
  agentId: string;
  providerId: string | null;
  model: string | null;
  fallbackProviderId: string | null;
  fallbackModel: string | null;
  status: "active" | "paused";
  temperature: number | null;
  reasoningEffort: string | null;
  maxOutputTokens: number | null;
}

export interface AgentView {
  id: string;
  name: string;
  systemPrompt: string;
  toolsAllowed: string[];
  active: boolean;
  binding: AgentBinding | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string })?.error ?? "Error de IA.");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export const aiApi = {
  listProviders: () => req<{ providers: ProviderView[] }>("/api/ai/providers"),
  createProvider: (body: Record<string, unknown>) =>
    req<{ provider: ProviderView }>("/api/ai/providers", { method: "POST", body: JSON.stringify(body) }),
  updateProvider: (id: string, body: Record<string, unknown>) =>
    req<{ provider: ProviderView }>(`/api/ai/providers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProvider: (id: string) =>
    req<{ ok: boolean }>(`/api/ai/providers/${id}`, { method: "DELETE" }),
  testProvider: (id: string) =>
    req<{ result: { ok: boolean; latencyMs: number; message: string; modelsAvailable?: number } }>(
      `/api/ai/providers/${id}/test`, { method: "POST" }),
  listModels: (id: string) =>
    req<{ models: { id: string; label?: string }[] }>(`/api/ai/providers/${id}/models`),
  rotateKey: (id: string, apiKey: string) =>
    req<{ ok: boolean }>(`/api/ai/providers/${id}/rotate-key`, { method: "POST", body: JSON.stringify({ apiKey }) }),
  listAgents: () => req<{ agents: AgentView[] }>("/api/ai/agents"),
  updateAgent: (id: string, body: Record<string, unknown>) =>
    req<{ binding: AgentBinding }>(`/api/ai/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  testAgent: (id: string, message: string) =>
    req<{
      text: string; testMode: boolean; usedFallback: boolean;
      usage: { inputTokens: number; outputTokens: number };
      estimatedCostUsd: number | null; latencyMs: number; status: string;
    }>(`/api/ai/agents/${id}/test`, { method: "POST", body: JSON.stringify({ message }) }),
  usage: (params?: { providerId?: string; agentId?: string }) => {
    const q = new URLSearchParams();
    if (params?.providerId) q.set("providerId", params.providerId);
    if (params?.agentId) q.set("agentId", params.agentId);
    const qs = q.toString();
    return req<{ summary: { requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number; errors: number; avgLatencyMs: number } }>(
      `/api/ai/usage${qs ? `?${qs}` : ""}`);
  },
};

/** Hook de lectura con estado de carga/error y refresco. */
export function useProviders() {
  const [providers, setProviders] = React.useState<ProviderView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const { providers } = await aiApi.listProviders();
      setProviders(providers);
      setError(null);
      setUnavailable(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) setUnavailable(true); // backend en modo local
      else setError(e instanceof Error ? e.message : "Error al cargar proveedores.");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return { providers, loading, error, unavailable, refresh };
}

export function useAgents() {
  const [agents, setAgents] = React.useState<AgentView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const { agents } = await aiApi.listAgents();
      setAgents(agents);
    } catch {
      /* silencioso: la pantalla muestra vacío/estado */
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return { agents, loading, refresh };
}

export const PROVIDER_STATUS_LABEL: Record<ProviderView["status"], string> = {
  unconfigured: "Sin configurar",
  connected: "Conectado",
  error: "Error",
  paused: "Pausado",
  limit_reached: "Límite alcanzado",
};
