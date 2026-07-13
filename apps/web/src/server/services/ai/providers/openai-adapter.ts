import "server-only";
import type {
  AIModel,
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamEvent,
  AIUsage,
  AdapterConfig,
  ConnectionTestResult,
  ProviderType,
} from "./types";
import { estimateCost } from "./pricing";

const DEFAULT_TIMEOUT = 30_000;

/** Error HTTP del proveedor con status legible para clasificar/registrar. */
export class ProviderHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

/**
 * Mensaje AMIGABLE por status. NUNCA incluye la respuesta cruda ni la clave.
 * `code` es el enum técnico de OpenAI (p. ej. `insufficient_quota`,
 * `unsupported_country_region_territory`) — seguro de mostrar y clave para
 * diagnosticar; se anexa entre paréntesis cuando existe.
 */
function friendlyError(status: number, code?: string): ProviderHttpError {
  let message =
    code === "insufficient_quota"
      ? "La cuenta de OpenAI no tiene crédito disponible. Agrega un método de pago o créditos en platform.openai.com → Billing."
      : code === "model_not_found"
        ? "El proyecto de la API key no tiene acceso al modelo configurado. En IA → Proveedores elige un modelo de la lista disponible, o habilita el modelo en platform.openai.com → Settings → Limits del proyecto."
        : status === 401
          ? "No pudimos validar la API key."
          : status === 403
            ? "La API key no tiene permiso para usar este servicio. Si es una clave restringida, actívale el permiso de Responses/Model capabilities en platform.openai.com."
            : status === 404
              ? "El modelo seleccionado no está disponible para esta conexión."
              : status === 429
                ? "El proveedor está limitando las solicitudes (rate limit o crédito agotado). Intenta más tarde."
                : status >= 500
                  ? "El proveedor de IA no está disponible en este momento."
                  : `El proveedor rechazó la solicitud (HTTP ${status}).`;
  if (code && code !== "insufficient_quota") message += ` (código: ${code})`;
  return new ProviderHttpError(status, message);
}

/** Extrae el código de error del body de OpenAI sin exponer el contenido. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const j = (await res.json()) as { error?: { code?: string; type?: string } };
    const raw = j?.error?.code ?? j?.error?.type;
    // Solo enums técnicos (letras/números/_/-), nunca texto libre.
    return typeof raw === "string" && /^[a-z0-9_.-]{1,64}$/i.test(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Adaptador OpenAI (y compatible-OpenAI). Ejecuta SOLO en servidor. La API key
 * se recibe descifrada por parámetro y NUNCA se persiste ni se devuelve. Usa la
 * Responses API (`POST /responses`).
 */
export class OpenAIProviderAdapter implements AIProviderAdapter {
  readonly type: ProviderType;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(apiKey: string, config: AdapterConfig) {
    this.type = config.type === "openai_compatible" ? "openai_compatible" : "openai";
    this.apiKey = apiKey;
    this.baseUrl = (config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
    // Los headers de organización/proyecto SOLO se envían con formato real de
    // OpenAI (org-… / proj_…). Un valor libre (p. ej. el nombre de la empresa)
    // haría que OpenAI rechace TODAS las solicitudes con 400/401.
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(config.organizationId?.startsWith("org-")
        ? { "OpenAI-Organization": config.organizationId }
        : {}),
      ...(config.projectId?.startsWith("proj_")
        ? { "OpenAI-Project": config.projectId }
        : {}),
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/models`,
        { headers: this.headers },
        this.timeoutMs,
      );
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { ok: false, latencyMs, message: friendlyError(res.status, await errorCode(res)).message };
      }
      const data = (await res.json()) as { data?: unknown[] };
      return {
        ok: true,
        latencyMs,
        message: "Proveedor conectado correctamente.",
        modelsAvailable: Array.isArray(data.data) ? data.data.length : undefined,
      };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        latencyMs,
        message: aborted
          ? "La conexión con el proveedor superó el tiempo de espera."
          : "No pudimos conectar con el proveedor de IA.",
      };
    }
  }

  async listModels(): Promise<AIModel[]> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/models`,
      { headers: this.headers },
      this.timeoutMs,
    );
    if (!res.ok) throw friendlyError(res.status, await errorCode(res));
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? [])
      .map((m) => ({ id: m.id, label: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async createResponse(input: AIRequest): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.input,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.maxOutputTokens ? { max_output_tokens: input.maxOutputTokens } : {}),
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
      ...(input.store != null ? { store: input.store } : {}),
      ...(input.tools?.length
        ? {
            tools: input.tools.map((t) => ({
              type: "function",
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          }
        : {}),
    };
    const res = await fetchWithTimeout(
      `${this.baseUrl}/responses`,
      { method: "POST", headers: this.headers, body: JSON.stringify(body) },
      input.timeoutMs ?? this.timeoutMs,
    );
    if (!res.ok) throw friendlyError(res.status, await errorCode(res));
    const json = (await res.json()) as OpenAIResponseBody;
    return parseResponse(json, input.model);
  }

  async *streamResponse(input: AIRequest): AsyncIterable<AIStreamEvent> {
    // MVP: streaming no incremental — resuelve la respuesta y la emite como un
    // solo delta. La interfaz queda lista para SSE real sin cambiar consumidores.
    try {
      const r = await this.createResponse(input);
      if (r.text) yield { type: "text", delta: r.text };
      for (const call of r.toolCalls) yield { type: "tool_call", call };
      yield { type: "done", usage: r.usage, status: r.status };
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : "Error de IA." };
    }
  }

  async calculateEstimatedCost(usage: AIUsage, model: string): Promise<number | null> {
    return estimateCost(usage, model);
  }
}

interface OpenAIResponseBody {
  status?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
    name?: string;
    arguments?: string;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseResponse(json: OpenAIResponseBody, model: string): AIResponse {
  let text = json.output_text ?? "";
  const toolCalls: AIResponse["toolCalls"] = [];
  for (const item of json.output ?? []) {
    if (item.type === "function_call" && item.name) {
      let args: Record<string, unknown> = {};
      try {
        args = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        args = {};
      }
      toolCalls.push({ name: item.name, arguments: args });
    }
    if (!text && item.content) {
      text = item.content
        .filter((c) => c.type === "output_text" && c.text)
        .map((c) => c.text)
        .join("");
    }
  }
  return {
    text,
    toolCalls,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
    status: json.status === "incomplete" ? "incomplete" : "completed",
    model,
  };
}
