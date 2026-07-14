import "server-only";

/**
 * Contrato canónico de adaptadores de proveedor de IA. Todos los agentes
 * consumen esta interfaz vía `AIProviderService` — NUNCA llaman a un SDK/HTTP de
 * proveedor directamente. Agregar un proveedor = implementar este adaptador,
 * sin tocar agentes ni tools.
 */

export type ProviderType =
  | "openai"
  | "openai_compatible"
  | "anthropic"
  | "google"
  | "local";

export interface AIModel {
  id: string;
  label?: string;
  /** Precio por 1K tokens si se conoce (para estimar costo). */
  inputPer1k?: number;
  outputPer1k?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  /** Mensaje AMIGABLE (nunca stack trace ni la clave ni respuesta cruda). */
  message: string;
  modelsAvailable?: number;
}

export interface AIToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ítems de continuación de tool-calling (Responses API): tras ejecutar las
 * herramientas, se reenvía el historial + la llamada del modelo + su resultado.
 */
export type AIInputItem =
  | AIChatMessage
  | { type: "function_call"; callId: string; name: string; argumentsJson: string }
  | { type: "function_call_output"; callId: string; output: string };

export interface AIRequest {
  model: string;
  instructions?: string;
  /** Texto simple, conversación multi-turno (chat), o ítems con tool-calling. */
  input: string | AIChatMessage[] | AIInputItem[];
  tools?: AIToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  store?: boolean;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIToolInvocation {
  name: string;
  arguments: Record<string, unknown>;
  /** Id de la llamada (Responses API) — necesario para devolver el resultado. */
  callId?: string;
}

export interface AIResponse {
  text: string;
  usage: AIUsage;
  toolCalls: AIToolInvocation[];
  /** "completed" | "incomplete" (p. ej. cortado por max tokens). */
  status: "completed" | "incomplete";
  model: string;
}

export type AIStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: AIToolInvocation }
  | { type: "done"; usage: AIUsage; status: "completed" | "incomplete" }
  | { type: "error"; message: string };

export interface AIProviderAdapter {
  readonly type: ProviderType;
  testConnection(): Promise<ConnectionTestResult>;
  listModels(): Promise<AIModel[]>;
  createResponse(input: AIRequest): Promise<AIResponse>;
  streamResponse(input: AIRequest): AsyncIterable<AIStreamEvent>;
  calculateEstimatedCost(usage: AIUsage, model: string): Promise<number | null>;
}

/** Config no-secreta del proveedor que necesita el adaptador. */
export interface AdapterConfig {
  type: ProviderType;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  timeoutMs?: number;
}
