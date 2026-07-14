import { describe, it, expect, vi } from "vitest";
import { runWithTools } from "./tool-loop";
import type { AIRequest, AIResponse } from "./providers/types";

const TOOLS = [{ name: "get_expiring_lots", description: "d", parameters: {} }];

function resp(partial: Partial<AIResponse>): AIResponse {
  return {
    text: "", toolCalls: [], status: "completed", model: "m",
    usage: { inputTokens: 10, outputTokens: 5 },
    ...partial,
  };
}

describe("runWithTools", () => {
  it("sin executeTool se comporta como una sola llamada", async () => {
    const create = vi.fn().mockResolvedValue(resp({ text: "hola" }));
    const r = await runWithTools(create, { model: "m", input: "x", tools: TOOLS });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.text).toBe("hola");
  });

  it("ejecuta la tool, devuelve el resultado al modelo y suma usage", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(resp({
        toolCalls: [{ name: "get_expiring_lots", arguments: { days: 30 }, callId: "c1" }],
      }))
      .mockResolvedValueOnce(resp({ text: "Tienes 3 lotes vencidos." }));
    const exec = vi.fn().mockResolvedValue('{"vencidos":3}');

    const r = await runWithTools(create, { model: "m", input: "¿vencidos?", tools: TOOLS }, exec);

    expect(exec).toHaveBeenCalledWith(expect.objectContaining({ name: "get_expiring_lots" }));
    // Segunda llamada lleva la function_call + su output con el MISMO callId.
    const secondInput = create.mock.calls[1]![0].input as Array<Record<string, unknown>>;
    expect(secondInput).toEqual([
      { role: "user", content: "¿vencidos?" },
      { type: "function_call", callId: "c1", name: "get_expiring_lots", argumentsJson: '{"days":30}' },
      { type: "function_call_output", callId: "c1", output: '{"vencidos":3}' },
    ]);
    expect(r.text).toBe("Tienes 3 lotes vencidos.");
    expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(r.toolsUsed).toEqual(["get_expiring_lots"]);
  });

  it("si la tool lanza, el modelo recibe un JSON de error (no rompe el chat)", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(resp({ toolCalls: [{ name: "x", arguments: {}, callId: "c1" }] }))
      .mockResolvedValueOnce(resp({ text: "ok" }));
    const exec = vi.fn().mockRejectedValue(new Error("BD caída"));
    const r = await runWithTools(create, { model: "m", input: "q", tools: TOOLS }, exec);
    const secondInput = create.mock.calls[1]![0].input as Array<Record<string, unknown>>;
    expect(secondInput[2]).toEqual({
      type: "function_call_output", callId: "c1", output: '{"error":"BD caída"}',
    });
    expect(r.text).toBe("ok");
  });

  it("tope de rondas: la última llamada va SIN tools para forzar texto", async () => {
    const withCall = () => resp({ toolCalls: [{ name: "t", arguments: {}, callId: `c${Math.random()}` }] });
    const create = vi.fn()
      .mockResolvedValueOnce(withCall())
      .mockResolvedValueOnce(withCall())
      .mockResolvedValueOnce(resp({ text: "final" }));
    const exec = vi.fn().mockResolvedValue("{}");
    const r = await runWithTools(create, { model: "m", input: "q", tools: TOOLS }, exec, 2);
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2]![0].tools).toBeUndefined(); // ronda final sin tools
    expect(r.text).toBe("final");
  });
});
