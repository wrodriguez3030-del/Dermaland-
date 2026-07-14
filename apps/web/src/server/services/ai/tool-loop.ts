import "server-only";
import type {
  AIInputItem,
  AIRequest,
  AIResponse,
  AIToolInvocation,
} from "./providers/types";

/**
 * Bucle de tool-calling sobre la Responses API.
 *
 * El modelo puede pedir herramientas (function calls); aquí se ejecutan vía
 * `executeTool` y se le devuelven los resultados hasta que responda con texto
 * o se agoten las rondas (`maxRounds`). En la última ronda se llama SIN tools
 * para forzar una respuesta textual (nunca devolvemos "vacío" al usuario).
 *
 * Es puro respecto al proveedor: recibe `create` (el adaptador) y no conoce
 * Supabase ni logging — eso queda en `provider-service.runRequest`.
 */
export interface ToolLoopResult extends AIResponse {
  /** Nombres de tools ejecutadas en TODAS las rondas (para logs). */
  toolsUsed: string[];
}

export async function runWithTools(
  create: (req: AIRequest) => Promise<AIResponse>,
  req: AIRequest,
  executeTool?: (call: AIToolInvocation) => Promise<string>,
  maxRounds = 5,
): Promise<ToolLoopResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const toolsUsed: string[] = [];

  // Sin ejecutor no hay bucle: comportamiento previo (una sola llamada).
  if (!executeTool || !req.tools?.length) {
    const res = await create(req);
    return { ...res, toolsUsed: res.toolCalls.map((t) => t.name) };
  }

  let items: AIInputItem[] =
    typeof req.input === "string"
      ? [{ role: "user", content: req.input }]
      : [...(req.input as AIInputItem[])];

  let res: AIResponse = await create({ ...req, input: items });
  usage.inputTokens += res.usage.inputTokens;
  usage.outputTokens += res.usage.outputTokens;

  let round = 0;
  while (res.toolCalls.length > 0 && round < maxRounds) {
    round += 1;
    for (const call of res.toolCalls) {
      // Sin callId no podemos devolver el resultado — se ignora la llamada.
      if (!call.callId) continue;
      toolsUsed.push(call.name);
      let output: string;
      try {
        output = await executeTool(call);
      } catch (e) {
        output = JSON.stringify({
          error: e instanceof Error ? e.message : "La herramienta falló.",
        });
      }
      items = [
        ...items,
        {
          type: "function_call",
          callId: call.callId,
          name: call.name,
          argumentsJson: JSON.stringify(call.arguments ?? {}),
        },
        { type: "function_call_output", callId: call.callId, output },
      ];
    }
    // Última ronda: sin tools, para forzar respuesta textual.
    const isLast = round >= maxRounds;
    res = await create({ ...req, input: items, tools: isLast ? undefined : req.tools });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
  }

  return { ...res, usage, toolsUsed };
}
