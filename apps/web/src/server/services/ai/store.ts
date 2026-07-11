import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClient } from "@/server/repositories/supabase/client";
import type { ProviderType } from "./providers/types";
import type { SealedApiKey } from "@/server/crypto/ai-cipher";

/**
 * Acceso a datos del módulo de Proveedores de IA. Multi-tenant: SIEMPRE filtra
 * por `business_id` (además de RLS). La API key descifrada NUNCA sale de aquí ni
 * se incluye en `AiProviderView` (solo `keyLastFour`). Las tablas `ai_*` aún no
 * están en `database.types.ts`, así que usamos un cliente sin tipar SOLO para
 * ellas; los mappers de este archivo son la frontera de tipos real.
 */
function ai(sb: Awaited<ReturnType<typeof getClient>>): SupabaseClient {
  return sb as unknown as SupabaseClient;
}

// ─── Vistas (sin secretos) ───────────────────────────────────────────────────
export interface AiProviderView {
  id: string;
  providerType: ProviderType;
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function toProviderView(row: any, keyLastFour: string | null): AiProviderView {
  return {
    id: row.id,
    providerType: row.provider_type,
    displayName: row.display_name,
    status: row.status,
    baseUrl: row.base_url ?? null,
    organizationId: row.organization_id ?? null,
    projectId: row.project_id ?? null,
    defaultModel: row.default_model ?? null,
    economicalModel: row.economical_model ?? null,
    reasoningModel: row.reasoning_model ?? null,
    fallbackModel: row.fallback_model ?? null,
    monthlyRequestLimit: row.monthly_request_limit ?? null,
    monthlyBudgetUsd: row.monthly_budget_usd == null ? null : Number(row.monthly_budget_usd),
    maxOutputTokens: row.max_output_tokens ?? null,
    maxToolCalls: row.max_tool_calls ?? null,
    timeoutMs: row.timeout_ms ?? null,
    streamingEnabled: !!row.streaming_enabled,
    storeResponses: !!row.store_responses,
    lastTestedAt: row.last_tested_at ?? null,
    lastTestStatus: row.last_test_status ?? null,
    lastTestLatencyMs: row.last_test_latency_ms ?? null,
    hasKey: keyLastFour != null,
    keyLastFour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertProviderInput {
  providerType: ProviderType;
  displayName: string;
  baseUrl?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  defaultModel?: string | null;
  economicalModel?: string | null;
  reasoningModel?: string | null;
  fallbackModel?: string | null;
  monthlyRequestLimit?: number | null;
  monthlyBudgetUsd?: number | null;
  maxOutputTokens?: number | null;
  maxToolCalls?: number | null;
  timeoutMs?: number | null;
  streamingEnabled?: boolean;
  storeResponses?: boolean;
  status?: AiProviderView["status"];
}

function providerRow(input: UpsertProviderInput): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) r[k] = v; };
  set("provider_type", input.providerType);
  set("display_name", input.displayName);
  set("base_url", input.baseUrl);
  set("organization_id", input.organizationId);
  set("project_id", input.projectId);
  set("default_model", input.defaultModel);
  set("economical_model", input.economicalModel);
  set("reasoning_model", input.reasoningModel);
  set("fallback_model", input.fallbackModel);
  set("monthly_request_limit", input.monthlyRequestLimit);
  set("monthly_budget_usd", input.monthlyBudgetUsd);
  set("max_output_tokens", input.maxOutputTokens);
  set("max_tool_calls", input.maxToolCalls);
  set("timeout_ms", input.timeoutMs);
  set("streaming_enabled", input.streamingEnabled);
  set("store_responses", input.storeResponses);
  set("status", input.status);
  return r;
}

async function keyLastFourMap(
  sb: Awaited<ReturnType<typeof getClient>>,
  businessId: string,
  providerIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (providerIds.length === 0) return map;
  const { data } = await ai(sb)
    .from("ai_provider_secrets")
    .select("provider_id, key_last_four")
    .eq("business_id", businessId)
    .in("provider_id", providerIds);
  for (const s of (data ?? []) as any[]) map.set(s.provider_id, s.key_last_four ?? null);
  return map;
}

// ─── Providers ───────────────────────────────────────────────────────────────
export async function listProviders(businessId: string): Promise<AiProviderView[]> {
  const sb = await getClient("ai.listProviders");
  const { data, error } = await ai(sb)
    .from("ai_providers")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar los proveedores de IA.");
  const rows = (data ?? []) as any[];
  const lf = await keyLastFourMap(sb, businessId, rows.map((r) => r.id));
  return rows.map((r) => toProviderView(r, lf.get(r.id) ?? null));
}

export async function getProvider(businessId: string, id: string): Promise<AiProviderView | null> {
  const sb = await getClient("ai.getProvider");
  const { data } = await ai(sb)
    .from("ai_providers").select("*")
    .eq("business_id", businessId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const lf = await keyLastFourMap(sb, businessId, [id]);
  return toProviderView(data, lf.get(id) ?? null);
}

export async function createProvider(
  businessId: string, createdBy: string | undefined, input: UpsertProviderInput,
): Promise<AiProviderView> {
  const sb = await getClient("ai.createProvider");
  const { data, error } = await ai(sb)
    .from("ai_providers")
    .insert({ ...providerRow(input), business_id: businessId, created_by: createdBy ?? null, status: input.status ?? "unconfigured" })
    .select("*").single();
  if (error || !data) throw new Error("No se pudo crear el proveedor de IA.");
  return toProviderView(data, null);
}

export async function updateProvider(
  businessId: string, id: string, input: Partial<UpsertProviderInput>,
): Promise<AiProviderView> {
  const sb = await getClient("ai.updateProvider");
  const { data, error } = await ai(sb)
    .from("ai_providers")
    .update({ ...providerRow(input as UpsertProviderInput), updated_at: new Date().toISOString() })
    .eq("business_id", businessId).eq("id", id).is("deleted_at", null)
    .select("*");
  if (error) throw new Error("No se pudo actualizar el proveedor de IA.");
  const rows = (data ?? []) as any[];
  if (rows.length === 0) throw new Error("Proveedor no encontrado.");
  const lf = await keyLastFourMap(sb, businessId, [id]);
  return toProviderView(rows[0], lf.get(id) ?? null);
}

export async function markTested(
  businessId: string, id: string, status: string, latencyMs: number,
): Promise<void> {
  const sb = await getClient("ai.markTested");
  await ai(sb).from("ai_providers")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status,
      last_test_latency_ms: latencyMs,
      status: status === "ok" ? "connected" : "error",
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId).eq("id", id);
}

export async function softDeleteProvider(businessId: string, id: string): Promise<void> {
  const sb = await getClient("ai.softDeleteProvider");
  await ai(sb).from("ai_providers")
    .update({ deleted_at: new Date().toISOString(), status: "unconfigured" })
    .eq("business_id", businessId).eq("id", id);
  await ai(sb).from("ai_provider_secrets").delete().eq("business_id", businessId).eq("provider_id", id);
}

// ─── Secrets (cifrados) ──────────────────────────────────────────────────────
export async function saveSecret(
  businessId: string, providerId: string, sealed: SealedApiKey,
): Promise<void> {
  const sb = await getClient("ai.saveSecret");
  const row = {
    business_id: businessId,
    provider_id: providerId,
    encrypted_api_key: sealed.ciphertext,
    iv: sealed.iv,
    auth_tag: sealed.authTag,
    encryption_version: sealed.version,
    key_last_four: sealed.lastFour,
    rotated_at: new Date().toISOString(),
  };
  const { error } = await ai(sb)
    .from("ai_provider_secrets")
    .upsert(row, { onConflict: "provider_id" });
  if (error) throw new Error("No se pudo guardar la credencial de forma segura.");
}

/** SOLO servidor: devuelve los campos cifrados para descifrar antes de llamar. */
export async function getSecretSealed(
  businessId: string, providerId: string,
): Promise<{ ciphertext: string; iv: string; authTag: string } | null> {
  const sb = await getClient("ai.getSecretSealed");
  const { data } = await ai(sb)
    .from("ai_provider_secrets")
    .select("encrypted_api_key, iv, auth_tag")
    .eq("business_id", businessId).eq("provider_id", providerId).maybeSingle();
  if (!data) return null;
  const d = data as any;
  return { ciphertext: d.encrypted_api_key, iv: d.iv, authTag: d.auth_tag };
}

// ─── Bindings agente↔proveedor ───────────────────────────────────────────────
export interface AiBindingView {
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

function toBinding(row: any): AiBindingView {
  return {
    agentId: row.agent_id,
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    fallbackProviderId: row.fallback_provider_id ?? null,
    fallbackModel: row.fallback_model ?? null,
    status: row.status,
    temperature: row.temperature == null ? null : Number(row.temperature),
    reasoningEffort: row.reasoning_effort ?? null,
    maxOutputTokens: row.max_output_tokens ?? null,
  };
}

export async function listBindings(businessId: string): Promise<AiBindingView[]> {
  const sb = await getClient("ai.listBindings");
  const { data } = await ai(sb).from("ai_agent_provider_bindings")
    .select("*").eq("business_id", businessId);
  return ((data ?? []) as any[]).map(toBinding);
}

export async function getBinding(businessId: string, agentId: string): Promise<AiBindingView | null> {
  const sb = await getClient("ai.getBinding");
  const { data } = await ai(sb).from("ai_agent_provider_bindings")
    .select("*").eq("business_id", businessId).eq("agent_id", agentId).maybeSingle();
  return data ? toBinding(data) : null;
}

export async function upsertBinding(
  businessId: string, agentId: string, patch: Partial<AiBindingView>,
): Promise<AiBindingView> {
  const sb = await getClient("ai.upsertBinding");
  const row: Record<string, unknown> = {
    business_id: businessId, agent_id: agentId, updated_at: new Date().toISOString(),
  };
  const set = (k: string, v: unknown) => { if (v !== undefined) row[k] = v; };
  set("provider_id", patch.providerId);
  set("model", patch.model);
  set("fallback_provider_id", patch.fallbackProviderId);
  set("fallback_model", patch.fallbackModel);
  set("status", patch.status);
  set("temperature", patch.temperature);
  set("reasoning_effort", patch.reasoningEffort);
  set("max_output_tokens", patch.maxOutputTokens);
  const { data, error } = await ai(sb).from("ai_agent_provider_bindings")
    .upsert(row, { onConflict: "business_id,agent_id" }).select("*").single();
  if (error || !data) throw new Error("No se pudo guardar la configuración del agente.");
  return toBinding(data);
}

// ─── Usage / logs ────────────────────────────────────────────────────────────
export interface UsageLogInput {
  agentId?: string;
  providerId?: string;
  providerType?: string;
  model?: string;
  userId?: string;
  branchId?: string;
  conversationId?: string;
  channel?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs?: number;
  toolsUsed?: string[];
  status: "success" | "error" | "timeout" | "rate_limited" | "fallback";
  errorSummary?: string;
  wasFallback?: boolean;
}

export async function logUsage(businessId: string, input: UsageLogInput): Promise<void> {
  const sb = await getClient("ai.logUsage");
  await ai(sb).from("ai_usage_logs").insert({
    business_id: businessId,
    agent_id: input.agentId ?? null,
    provider_id: input.providerId ?? null,
    provider_type: input.providerType ?? null,
    model: input.model ?? null,
    user_id: input.userId ?? null,
    branch_id: input.branchId ?? null,
    conversation_id: input.conversationId ?? null,
    channel: input.channel ?? null,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    estimated_cost_usd: input.estimatedCostUsd,
    latency_ms: input.latencyMs ?? null,
    tools_used: input.toolsUsed ?? null,
    status: input.status,
    error_summary: input.errorSummary ?? null,
    was_fallback: input.wasFallback ?? false,
  });
}

export interface UsageLogView {
  id: string;
  createdAt: string;
  agentId: string | null;
  providerType: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number | null;
  toolsUsed: string[];
  status: string;
  errorSummary: string | null;
  wasFallback: boolean;
}

/** Últimas solicitudes de IA del negocio (para Logs y costos). */
export async function listUsageLogs(
  businessId: string, limit = 50,
): Promise<UsageLogView[]> {
  const sb = await getClient("ai.listUsageLogs");
  const { data } = await ai(sb)
    .from("ai_usage_logs")
    .select("id, created_at, agent_id, provider_type, model, input_tokens, output_tokens, estimated_cost_usd, latency_ms, tools_used, status, error_summary, was_fallback")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    agentId: r.agent_id ?? null,
    providerType: r.provider_type ?? null,
    model: r.model ?? null,
    inputTokens: Number(r.input_tokens ?? 0),
    outputTokens: Number(r.output_tokens ?? 0),
    estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
    latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
    toolsUsed: r.tools_used ?? [],
    status: r.status,
    errorSummary: r.error_summary ?? null,
    wasFallback: !!r.was_fallback,
  }));
}

export interface UsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  errors: number;
  avgLatencyMs: number;
}

export async function getMonthlyUsage(
  businessId: string, opts: { providerId?: string; agentId?: string; sinceIso: string },
): Promise<UsageSummary> {
  const sb = await getClient("ai.getMonthlyUsage");
  let q = ai(sb).from("ai_usage_logs")
    .select("input_tokens, output_tokens, estimated_cost_usd, latency_ms, status")
    .eq("business_id", businessId).gte("created_at", opts.sinceIso);
  if (opts.providerId) q = q.eq("provider_id", opts.providerId);
  if (opts.agentId) q = q.eq("agent_id", opts.agentId);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const requests = rows.length;
  let inTok = 0, outTok = 0, cost = 0, errors = 0, latSum = 0, latN = 0;
  for (const r of rows) {
    inTok += Number(r.input_tokens ?? 0);
    outTok += Number(r.output_tokens ?? 0);
    cost += Number(r.estimated_cost_usd ?? 0);
    if (r.status !== "success") errors += 1;
    if (r.latency_ms != null) { latSum += Number(r.latency_ms); latN += 1; }
  }
  return {
    requests, inputTokens: inTok, outputTokens: outTok,
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6,
    errors, avgLatencyMs: latN ? Math.round(latSum / latN) : 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
