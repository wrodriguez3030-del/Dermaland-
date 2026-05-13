import "server-only";
import { env, isOpenAIConfigured } from "@/lib/env";
import { ALLOWED_TOOLS, validateToolName, validateToolSet } from "./tools";

/**
 * AI service — function calling con OpenAI (default) o Anthropic (fallback).
 *
 * Tools del agente están en `tools.ts` con bloqueo duro de agendamiento.
 *
 * Plan-maestro Fase 7. Riesgo crítico: R-AI-01 (agente intenta agendar).
 */

export class OpenAINotConfigured extends Error {
  constructor() {
    super("OPENAI_API_KEY no está configurada en `.env`.");
    this.name = "OpenAINotConfigured";
  }
}

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AICompletionResult {
  content: string;
  toolCalls: AIToolCall[];
  usage: { inputTokens: number; outputTokens: number; costUSD: number };
}

export interface AIService {
  complete(messages: AIMessage[]): Promise<AICompletionResult>;
  /**
   * Ejecuta una tool. Pasa por validación dura — si la tool no está
   * registrada o está prohibida, lanza error.
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

const SYSTEM_PROMPT = `Eres el asistente conversacional de DermaLand, una plataforma de farmacia y dermocosmética en República Dominicana.

REGLAS DURAS:
1. **NO realizamos agendamiento.** Si el usuario pide una cita, consulta de horario, reservar, agendar o reprogramar, responde:
   "Disculpa, en DermaLand no manejamos agendamiento. Puedo ayudarte con consultas de productos, stock, recomendaciones dermatológicas, facturas o pedidos."
   Y opcionalmente usa la tool \`handoff_to_human\` si insiste.
2. Para preguntas fuera de tu alcance (médicas específicas, diagnóstico clínico), deriva con \`handoff_to_human\`.
3. Solo usa información que obtengas de las tools — no inventes precios, stock, ni datos de clientes.
4. Comunicación en español dominicano. Tono profesional y cálido.`;

class AIServiceImpl implements AIService {
  async complete(messages: AIMessage[]): Promise<AICompletionResult> {
    if (!isOpenAIConfigured()) throw new OpenAINotConfigured();

    // Validación de tools antes de cada llamada — defensa en profundidad
    validateToolSet(ALLOWED_TOOLS);

    const model = env.OPENAI_DEFAULT_MODEL;
    const fullMessages: AIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        tools: ALLOWED_TOOLS.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const msg = data.choices[0]?.message;
    const toolCalls: AIToolCall[] =
      msg?.tool_calls?.map((tc) => {
        // Defensa adicional: si el LLM intenta llamar una tool prohibida
        // (por inyección, jailbreak, prompt manipulation), bloqueamos aquí.
        validateToolName(tc.function.name);
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        };
      }) ?? [];

    return {
      content: msg?.content ?? "",
      toolCalls,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        // gpt-4o-mini: ~$0.15/1M input + $0.60/1M output (precio nominal)
        costUSD:
          (data.usage.prompt_tokens / 1_000_000) * 0.15 +
          (data.usage.completion_tokens / 1_000_000) * 0.6,
      },
    };
  }

  async callTool(
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<unknown> {
    validateToolName(toolName);

    // Despacho real: cada tool ejecuta un repo + retorna shape esperado
    // por el LLM. Implementación pendiente — depende de los repos Supabase.
    switch (toolName) {
      case "handoff_to_human":
        return { handed_off: true };
      default:
        throw new Error(
          `Tool ${toolName} aún no implementada — pendiente Fase 7.`,
        );
    }
  }
}

export const aiService: AIService = new AIServiceImpl();
