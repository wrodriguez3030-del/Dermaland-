import "server-only";
import { getAiEncryptionKeyOrThrow, isAiCredentialsEncryptionConfigured } from "@/lib/env";
import { decryptApiKey, encryptApiKey } from "@/server/crypto/ai-cipher";
import { saveSecret } from "./store";
import { createAdapter } from "./providers/factory";
import { ProviderHttpError } from "./providers/openai-adapter";
import type {
  AIChatMessage,
  AIModel,
  AIRequest,
  AIResponse,
  AIToolSpec,
  ConnectionTestResult,
} from "./providers/types";
import { estimateCost } from "./providers/pricing";
import {
  getProvider,
  getSecretSealed,
  markTested,
  getMonthlyUsage,
  countRequestsSince,
  logUsage,
  type AiProviderView,
} from "./store";

/** SEC-015: tope de solicitudes de IA por minuto y por negocio (anti-ráfaga). */
const AI_REQUESTS_PER_MINUTE = 30;

/**
 * Capa CENTRAL de IA. Los agentes/tools llaman aquí; NUNCA a un SDK/HTTP de
 * proveedor directamente. Descifra la API key server-side justo antes de la
 * llamada; la clave nunca sale de este proceso ni se devuelve al cliente.
 */

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function adapterFor(businessId: string, provider: AiProviderView) {
  const sealed = await getSecretSealed(businessId, provider.id);
  if (!sealed) throw new AiServiceError("provider_not_configured", "Configura un proveedor de IA para activar este agente.");
  const apiKey = await decryptApiKey(sealed, getAiEncryptionKeyOrThrow());
  return createAdapter(apiKey, {
    type: provider.providerType,
    baseUrl: provider.baseUrl ?? undefined,
    organizationId: provider.organizationId ?? undefined,
    projectId: provider.projectId ?? undefined,
    timeoutMs: provider.timeoutMs ?? undefined,
  });
}

export class AiServiceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AiServiceError";
  }
}

/**
 * Cifra y guarda la API key de un proveedor. Bloquea si falta la master key
 * (nunca guarda en texto plano). La clave se descarta de memoria tras cifrar.
 */
export async function saveProviderKey(
  businessId: string, providerId: string, apiKey: string,
): Promise<void> {
  if (!isAiCredentialsEncryptionConfigured()) {
    throw new AiServiceError(
      "no_encryption",
      "Falta configurar AI_CREDENTIALS_ENCRYPTION_KEY en el servidor; no se pueden guardar credenciales de IA de forma segura. Contacta al administrador del sistema.",
    );
  }
  const sealed = await encryptApiKey(apiKey, getAiEncryptionKeyOrThrow());
  await saveSecret(businessId, providerId, sealed);
}

/**
 * Resuelve proveedor+modelo de un agente. Si el binding no trae modelo, usa el
 * modelo predeterminado del proveedor (para que "solo elegir proveedor" baste).
 */
export async function resolveAgentTarget(
  businessId: string,
  binding: { providerId: string | null; model: string | null },
): Promise<{ providerId: string; model: string }> {
  if (!binding.providerId) {
    throw new AiServiceError("provider_not_configured", "Configura un proveedor de IA para activar este agente.");
  }
  if (binding.model) return { providerId: binding.providerId, model: binding.model };
  const provider = await getProvider(businessId, binding.providerId);
  if (!provider?.defaultModel) {
    throw new AiServiceError(
      "no_model",
      "Elige un modelo para este agente (o define un modelo predeterminado en el proveedor).",
    );
  }
  return { providerId: binding.providerId, model: provider.defaultModel };
}

/** Probar conexión de un proveedor (usa su clave cifrada). Marca last_test_*. */
export async function testProvider(
  businessId: string, providerId: string,
): Promise<ConnectionTestResult> {
  const provider = await getProvider(businessId, providerId);
  if (!provider) throw new AiServiceError("not_found", "Proveedor no encontrado.");
  const sealed = await getSecretSealed(businessId, providerId);
  if (!sealed) {
    return { ok: false, latencyMs: 0, message: "Agrega una API key antes de probar la conexión." };
  }
  const apiKey = await decryptApiKey(sealed, getAiEncryptionKeyOrThrow());
  const adapter = createAdapter(apiKey, {
    type: provider.providerType,
    baseUrl: provider.baseUrl ?? undefined,
    organizationId: provider.organizationId ?? undefined,
    projectId: provider.projectId ?? undefined,
    timeoutMs: provider.timeoutMs ?? undefined,
  });
  const result = await adapter.testConnection();
  await markTested(businessId, providerId, result.ok ? "ok" : "error", result.latencyMs);
  return result;
}

/** Listar modelos disponibles del proveedor. */
export async function listProviderModels(
  businessId: string, providerId: string,
): Promise<AIModel[]> {
  const provider = await getProvider(businessId, providerId);
  if (!provider) throw new AiServiceError("not_found", "Proveedor no encontrado.");
  const adapter = await adapterFor(businessId, provider);
  return adapter.listModels();
}

const RETRIABLE = new Set(["timeout", "rate_limited", "unavailable"]);

export interface RunRequestParams {
  businessId: string;
  userId?: string;
  branchId?: string;
  agentId?: string;
  providerId: string;
  model: string;
  instructions?: string;
  /** Texto simple o historial de chat multi-turno. */
  input: string | AIChatMessage[];
  /** Id de conversación (para agrupar en logs) y canal ("chat", "test"…). */
  conversationId?: string;
  channel?: string;
  tools?: AIToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Si se define, se usa cuando el principal falla por causa retriable. */
  fallback?: { providerId: string; model: string } | null;
  /** No registrar uso (modo prueba puede quererlo; por defecto sí registra). */
  logging?: boolean;
}

export interface RunRequestResult extends AIResponse {
  providerId: string;
  usedFallback: boolean;
  estimatedCostUsd: number | null;
  latencyMs: number;
}

/**
 * Ejecuta una solicitud de IA con control de presupuesto, fallback y registro de
 * uso. Lanza `AiServiceError("limit_reached", ...)` si se agotó el límite y no
 * hay fallback por política.
 */
export async function runRequest(params: RunRequestParams): Promise<RunRequestResult> {
  const provider = await getProvider(params.businessId, params.providerId);
  if (!provider) throw new AiServiceError("not_found", "Proveedor no encontrado.");

  // SEC-015: rate-limit por minuto (anti-ráfaga / DoS económico).
  const lastMinuteIso = new Date(Date.now() - 60_000).toISOString();
  const recent = await countRequestsSince(params.businessId, lastMinuteIso);
  if (recent >= AI_REQUESTS_PER_MINUTE) {
    throw new AiServiceError("rate_limited", "Demasiadas solicitudes de IA en poco tiempo. Espera un momento.");
  }

  // Presupuesto: solicitudes y USD del mes.
  const usage = await getMonthlyUsage(params.businessId, {
    providerId: params.providerId, sinceIso: monthStartIso(),
  });
  const overRequests = provider.monthlyRequestLimit != null && usage.requests >= provider.monthlyRequestLimit;
  const overBudget = provider.monthlyBudgetUsd != null && usage.estimatedCostUsd >= provider.monthlyBudgetUsd;
  if (overRequests || overBudget) {
    throw new AiServiceError("limit_reached", "Se alcanzó el límite mensual configurado.");
  }

  const started = Date.now();
  const req: AIRequest = {
    model: params.model,
    instructions: params.instructions,
    input: params.input,
    tools: params.tools,
    maxOutputTokens: params.maxOutputTokens ?? provider.maxOutputTokens ?? undefined,
    temperature: params.temperature,
    timeoutMs: provider.timeoutMs ?? undefined,
    store: provider.storeResponses,
  };

  try {
    const adapter = await adapterFor(params.businessId, provider);
    const res = await adapter.createResponse(req);
    const latencyMs = Date.now() - started;
    const cost = estimateCost(res.usage, params.model);
    if (params.logging !== false) {
      await logUsage(params.businessId, {
        agentId: params.agentId, providerId: params.providerId, providerType: provider.providerType,
        model: params.model, userId: params.userId, branchId: params.branchId,
        conversationId: params.conversationId, channel: params.channel,
        inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens,
        estimatedCostUsd: cost ?? 0, latencyMs,
        toolsUsed: res.toolCalls.map((t) => t.name),
        status: "success",
      });
    }
    return { ...res, providerId: params.providerId, usedFallback: false, estimatedCostUsd: cost, latencyMs };
  } catch (err) {
    const reason = classifyError(err);
    // Fallback SOLO por causas retriables (timeout/rate-limit/no disponible).
    if (params.fallback && RETRIABLE.has(reason)) {
      const fb = await getProvider(params.businessId, params.fallback.providerId);
      if (fb) {
        const startedFb = Date.now();
        const adapter = await adapterFor(params.businessId, fb);
        const res = await adapter.createResponse({ ...req, model: params.fallback.model });
        const latencyMs = Date.now() - startedFb;
        const cost = estimateCost(res.usage, params.fallback.model);
        if (params.logging !== false) {
          await logUsage(params.businessId, {
            agentId: params.agentId, providerId: fb.id, providerType: fb.providerType,
            model: params.fallback.model, userId: params.userId, branchId: params.branchId,
            conversationId: params.conversationId, channel: params.channel,
            inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens,
            estimatedCostUsd: cost ?? 0, latencyMs,
            toolsUsed: res.toolCalls.map((t) => t.name),
            status: "fallback", wasFallback: true,
            errorSummary: `principal falló: ${reason}`,
          });
        }
        return { ...res, providerId: fb.id, usedFallback: true, estimatedCostUsd: cost, latencyMs };
      }
    }
    if (params.logging !== false) {
      await logUsage(params.businessId, {
        agentId: params.agentId, providerId: params.providerId, providerType: provider.providerType,
        model: params.model, userId: params.userId, branchId: params.branchId,
        conversationId: params.conversationId, channel: params.channel,
        inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: Date.now() - started,
        status: reason === "timeout" ? "timeout" : reason === "rate_limited" ? "rate_limited" : "error",
        // Diagnóstico: status HTTP + mensaje amigable (nunca la clave ni la
        // respuesta cruda — friendlyError garantiza eso).
        errorSummary:
          err instanceof ProviderHttpError
            ? `HTTP ${err.status}: ${err.message}`.slice(0, 300)
            : reason,
      });
    }
    if (err instanceof AiServiceError) throw err;
    // Conservar el mensaje AMIGABLE del adaptador (p. ej. "No pudimos validar
    // la API key.") en vez de taparlo con un genérico — el usuario necesita
    // saber la causa para poder corregirla.
    const friendly =
      err instanceof ProviderHttpError || err instanceof Error
        ? err.message
        : "";
    throw new AiServiceError(
      reason,
      friendly && friendly.length <= 250 ? friendly : "No se pudo completar la solicitud de IA.",
    );
  }
}

function classifyError(err: unknown): "timeout" | "rate_limited" | "unavailable" | "error" {
  if (err instanceof ProviderHttpError) {
    if (err.status === 429) return "rate_limited";
    if (err.status >= 500) return "unavailable";
    return "error";
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("tiempo de espera") || msg.includes("timeout") || msg.includes("abort")) return "timeout";
  if (msg.includes("rate limit") || msg.includes("limitando")) return "rate_limited";
  if (msg.includes("no está disponible") || msg.includes("no disponible")) return "unavailable";
  return "error";
}
